import React, { useState, useRef } from 'react';
import { FaImage, FaMagic, FaCheckCircle, FaExclamationCircle, FaTrash, FaLayerGroup } from 'react-icons/fa';
import api from '../../utils/api';
import CafeQRPopup from '../CafeQRPopup';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanText = (value, fallback = '') => String(value ?? fallback).trim();
const keyFor = (value) => cleanText(value).toLowerCase();
const toMoney = (value) => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizeImportedVariants = (variants) => {
  if (!Array.isArray(variants)) return [];

  return variants
    .map((variant) => {
      const template = cleanText(
        variant?.template || variant?.name || variant?.group || variant?.variantGroup,
        'Options'
      ) || 'Options';
      const optionSeen = new Set();
      const options = (Array.isArray(variant?.options) ? variant.options : [])
        .map((option) => {
          const name = cleanText(
            option?.name || option?.option || option?.label || option?.size || option?.portion || option?.type
          );
          const price = toMoney(option?.price ?? option?.amount ?? option?.rate);
          return { name, price };
        })
        .filter((option) => {
          if (!option.name) return false;
          const optionKey = keyFor(option.name);
          if (optionSeen.has(optionKey)) return false;
          optionSeen.add(optionKey);
          return true;
        });

      return {
        template,
        required: variant?.required !== false,
        options,
      };
    })
    .filter((variant) => variant.options.length > 0);
};

const normalizeImportedItem = (item) => {
  const variants = normalizeImportedVariants(item?.variants);
  const variantPrices = variants
    .flatMap((variant) => variant.options.map((option) => toMoney(option.price)))
    .filter((price) => price > 0);
  const parsedPrice = toMoney(item?.price);

  return {
    name: cleanText(item?.name),
    category: cleanText(item?.category, 'General') || 'General',
    price: parsedPrice || (variantPrices.length ? Math.min(...variantPrices) : 0),
    description: cleanText(item?.description),
    veg: Boolean(item?.veg),
    variants,
    selected: true,
  };
};

export default function MenuImageImport({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [items, setItems] = useState([]);
  const [step, setStep] = useState('upload'); // upload, processing, review, importing
  const [error, setError] = useState(null);
  const fileInputRef = useRef();

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setError(null);
    }
  };

  const compressImage = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
    });
  };

  const processImage = async () => {
    if (!file) return;
    setStep('processing');
    setError(null);
    try {
      const base64 = await compressImage(file);
      let data = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const res = await fetch('/api/ai/parse-menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        });

        data = await res.json().catch(() => ({}));
        if (res.ok) break;

        if ((res.status === 503 || res.status === 504) && attempt === 1) {
          await sleep(2500);
          continue;
        }

        throw new Error(data.details || data.message || 'Failed to parse menu');
      }
      
      setItems((data.items || []).map(normalizeImportedItem).filter((it) => it.name));
      setStep('review');
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  };

  const loadVariantGroupsWithOptions = async () => {
    const resp = await api.get('/api/v1/products/variants/groups');
    const groups = resp.data?.data || [];

    return Promise.all(groups.map(async (group) => {
      try {
        const optionsResp = await api.get(`/api/v1/products/variants/groups/${group.id}/options`);
        return { ...group, options: optionsResp.data?.data || group.options || [] };
      } catch {
        return { ...group, options: group.options || [] };
      }
    }));
  };

  const ensureVariantGroup = async (cache, variant) => {
    const groupKey = keyFor(variant.template);
    const existingIndex = cache.findIndex((group) => keyFor(group.name) === groupKey);

    if (existingIndex === -1) {
      const createResp = await api.post('/api/v1/products/variants/groups', {
        name: variant.template,
        isActive: true,
        options: variant.options.map((option) => ({
          name: option.name,
          additionalPrice: 0,
          isActive: true,
        })),
      });

      const created = createResp.data?.data;
      if (!created?.id) throw new Error(`Variant group "${variant.template}" could not be created.`);

      let createdOptions = created.options || [];
      if (!createdOptions.length) {
        const optionsResp = await api.get(`/api/v1/products/variants/groups/${created.id}/options`);
        createdOptions = optionsResp.data?.data || [];
      }

      const hydrated = { ...created, options: createdOptions };
      cache.push(hydrated);
      return hydrated;
    }

    const group = { ...cache[existingIndex], options: cache[existingIndex].options || [] };
    const optionKeys = new Set(group.options.map((option) => keyFor(option.name)));
    const missingOptions = variant.options.filter((option) => !optionKeys.has(keyFor(option.name)));

    for (const option of missingOptions) {
      const optionResp = await api.post('/api/v1/products/variants/options', {
        name: option.name,
        additionalPrice: 0,
        isActive: true,
        group: { id: group.id },
      });
      if (optionResp.data?.data?.id) {
        group.options.push(optionResp.data.data);
      }
    }

    cache[existingIndex] = group;
    return group;
  };

  const buildProductPayload = async (selectedItems) => {
    const variantCache = await loadVariantGroupsWithOptions();
    const payload = [];

    for (const item of selectedItems) {
      const variants = normalizeImportedVariants(item.variants);
      const variantMappings = [];
      const variantPricings = [];

      for (const variant of variants) {
        const group = await ensureVariantGroup(variantCache, variant);
        const optionsByName = new Map((group.options || []).map((option) => [keyFor(option.name), option]));

        variantMappings.push({
          variantGroup: { id: group.id },
          isRequired: variant.required !== false,
        });

        variant.options.forEach((option) => {
          const resolvedOption = optionsByName.get(keyFor(option.name));
          if (!resolvedOption?.id) return;
          variantPricings.push({
            variantOption: { id: resolvedOption.id },
            overridePrice: toMoney(option.price),
            isAvailable: true,
          });
        });
      }

      payload.push({
        name: cleanText(item.name),
        price: toMoney(item.price),
        description: cleanText(item.description),
        category: { name: cleanText(item.category, 'General') || 'General' },
        productType: item.veg ? 'VEG' : 'NON_VEG',
        isAvailable: true,
        isActive: true,
        isIngredient: false,
        isPackagedGood: false,
        isVariant: variants.length > 0,
        variantMappings,
        variantPricings,
      });
    }

    return payload;
  };

  const handleImport = async () => {
    const selectedItems = items.filter(it => it.selected);
    if (selectedItems.length === 0) return;

    setStep('importing');
    try {
      const payload = await buildProductPayload(selectedItems);

      const res = await api.post('/api/v1/products/bulk', payload);
      if (res.data.success) {
        onImported(res.data.data);
        onClose();
      } else {
        throw new Error(res.data.message || 'Failed to import products');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setStep('review');
    }
  };

  const toggleItem = (idx) => {
    const updated = [...items];
    updated[idx].selected = !updated[idx].selected;
    setItems(updated);
  };

  const updateItemField = (idx, field, value) => {
    const updated = [...items];
    updated[idx][field] = field === 'price' ? parseFloat(value) || 0 : value;
    setItems(updated);
  };

  const updateVariantField = (itemIdx, variantIdx, field, value) => {
    const updated = [...items];
    const variants = [...(updated[itemIdx].variants || [])];
    variants[variantIdx] = { ...variants[variantIdx], [field]: value };
    updated[itemIdx] = { ...updated[itemIdx], variants };
    setItems(updated);
  };

  const updateVariantOption = (itemIdx, variantIdx, optionIdx, field, value) => {
    const updated = [...items];
    const variants = [...(updated[itemIdx].variants || [])];
    const options = [...(variants[variantIdx].options || [])];
    options[optionIdx] = {
      ...options[optionIdx],
      [field]: field === 'price' ? toMoney(value) : value,
    };
    variants[variantIdx] = { ...variants[variantIdx], options };
    updated[itemIdx] = { ...updated[itemIdx], variants };
    setItems(updated);
  };

  const removeVariantOption = (itemIdx, variantIdx, optionIdx) => {
    const updated = [...items];
    const variants = [...(updated[itemIdx].variants || [])];
    const options = (variants[variantIdx].options || []).filter((_, index) => index !== optionIdx);
    variants[variantIdx] = { ...variants[variantIdx], options };
    updated[itemIdx] = {
      ...updated[itemIdx],
      variants: variants.filter((variant) => variant.options.length > 0),
    };
    setItems(updated);
  };

  const getSaveLabel = () => {
    if (step === 'upload') return 'Start AI Analysis';
    if (step === 'review') return `Complete Import (${items.filter(it => it.selected).length})`;
    return 'Save';
  };

  return (
    <CafeQRPopup
      title="AI Menu Image Import"
      onClose={onClose}
      onSave={step === 'processing' || step === 'importing' ? null : (step === 'upload' ? (file ? processImage : null) : handleImport)}
      saveLabel={getSaveLabel()}
      isSaving={step === 'processing' || step === 'importing'}
      icon={FaMagic}
    >
      <div className="import-body-content">
        {error && (
          <div className="import-error">
            <FaExclamationCircle /> {error}
          </div>
        )}

        {step === 'upload' && (
          <div className="upload-section">
            {preview ? (
              <div className="preview-container">
                <img src={preview} alt="Menu Preview" className="menu-preview" />
                <button className="change-file-btn" onClick={() => { setFile(null); setPreview(null); }}>
                  Change Image
                </button>
              </div>
            ) : (
              <div className="drop-zone" onClick={() => fileInputRef.current.click()}>
                <FaImage className="drop-icon" />
                <p>Click to upload a clear photo of your menu</p>
                <span>Supports PNG, JPG (Max 5MB)</span>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" hidden />
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="processing-state">
            <div className="ai-loader"></div>
            <h4>AI is analyzing your menu...</h4>
            <p>Extracting items, prices, and categories. This usually takes 10-20 seconds.</p>
          </div>
        )}

        {step === 'review' && (
          <div className="review-section">
            <div className="review-header">
              <span>{items.filter(i => i.selected).length} items selected for import</span>
            </div>
            <div className="items-list">
              {items.map((it, idx) => (
                <div key={idx} className={`review-item ${!it.selected ? 'disabled' : ''}`}>
                  <div className="item-checkbox" onClick={() => toggleItem(idx)}>
                    {it.selected ? <FaCheckCircle className="checked" /> : <div className="unchecked" />}
                  </div>
                  <div className="item-fields">
                    <div className="field-row">
                      <input 
                        className="name-input" 
                        value={it.name} 
                        onChange={(e) => updateItemField(idx, 'name', e.target.value)} 
                        placeholder="Item Name" 
                      />
                      <div className="price-input-wrap">
                        <span>₹</span>
                        <input 
                          type="number" 
                          value={it.price} 
                          onChange={(e) => updateItemField(idx, 'price', e.target.value)} 
                        />
                      </div>
                    </div>
                    <div className="field-row secondary">
                      <input 
                        className="cat-input" 
                        value={it.category} 
                        onChange={(e) => updateItemField(idx, 'category', e.target.value)} 
                        placeholder="Category" 
                      />
                      <input 
                        className="desc-input" 
                        value={it.description} 
                        onChange={(e) => updateItemField(idx, 'description', e.target.value)} 
                        placeholder="Description (Optional)" 
                      />
                    </div>
                    {it.variants?.length > 0 && (
                      <div className="variant-section">
                        <div className="variant-title">
                          <FaLayerGroup />
                          <span>{it.variants.length} variant group{it.variants.length > 1 ? 's' : ''}</span>
                        </div>
                        {it.variants.map((variant, variantIdx) => (
                          <div className="variant-card" key={`${idx}-${variantIdx}`}>
                            <div className="variant-card-head">
                              <input
                                className="variant-template-input"
                                value={variant.template}
                                onChange={(e) => updateVariantField(idx, variantIdx, 'template', e.target.value)}
                                placeholder="Variant group, e.g. Size"
                              />
                              <label className="required-toggle">
                                <input
                                  type="checkbox"
                                  checked={variant.required !== false}
                                  onChange={(e) => updateVariantField(idx, variantIdx, 'required', e.target.checked)}
                                />
                                Required
                              </label>
                            </div>
                            <div className="variant-options">
                              <div className="variant-options-head">
                                <span>Option</span>
                                <span>Price</span>
                              </div>
                              {variant.options.map((option, optionIdx) => (
                                <div className="variant-option-row" key={`${idx}-${variantIdx}-${optionIdx}`}>
                                  <input
                                    className="variant-option-name"
                                    value={option.name}
                                    onChange={(e) => updateVariantOption(idx, variantIdx, optionIdx, 'name', e.target.value)}
                                    placeholder="Option name"
                                  />
                                  <div className="variant-price-wrap">
                                    <span>₹</span>
                                    <input
                                      type="number"
                                      value={option.price}
                                      onChange={(e) => updateVariantOption(idx, variantIdx, optionIdx, 'price', e.target.value)}
                                      placeholder="0"
                                    />
                                  </div>
                                  <button className="variant-option-delete" onClick={() => removeVariantOption(idx, variantIdx, optionIdx)}>
                                    <FaTrash />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="item-delete" onClick={() => {
                      const updated = items.filter((_, i) => i !== idx);
                      setItems(updated);
                  }}>
                    <FaTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="processing-state">
            <div className="simple-loader"></div>
            <h4>Importing to your catalog...</h4>
          </div>
        )}
      </div>

      <style jsx>{`
        .import-header h3 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }

        .upload-section { min-height: 300px; display: flex; flex-direction: column; }
        .drop-zone {
          flex: 1; border: 2px dashed #e2e8f0; border-radius: 20px; display: flex; flex-direction: column; align-items: center; 
          justify-content: center; gap: 12px; cursor: pointer; transition: 0.2s; padding: 40px; text-align: center;
        }
        .drop-zone:hover { border-color: #f97316; background: #fff7ed; }
        .drop-icon { font-size: 48px; color: #cbd5e1; }
        .drop-zone p { margin: 0; font-size: 15px; font-weight: 700; color: #334155; }
        .drop-zone span { font-size: 12px; color: #94a3b8; font-weight: 600; }

        .preview-container { display: flex; flex-direction: column; gap: 16px; align-items: center; }
        .menu-preview { max-width: 100%; max-height: 400px; border-radius: 12px; border: 1px solid #e2e8f0; }
        .change-file-btn { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; }

        .processing-state { text-align: center; padding: 40px 0; }
        .ai-loader { width: 48px; height: 48px; border: 4px solid #fff7ed; border-top-color: #f97316; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 24px; }
        .simple-loader { width: 32px; height: 32px; border: 3px solid #f1f5f9; border-top-color: #64748b; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 24px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .processing-state h4 { margin: 0 0 8px; font-size: 18px; font-weight: 800; color: #0f172a; }
        .processing-state p { margin: 0; color: #64748b; font-size: 14px; font-weight: 500; }

        .review-section { display: flex; flex-direction: column; gap: 16px; }
        .review-header { font-size: 13px; font-weight: 700; color: #64748b; background: #f8fafc; padding: 8px 16px; border-radius: 8px; }
        .items-list { display: flex; flex-direction: column; gap: 12px; }
        .review-item { 
          display: flex; align-items: flex-start; gap: 14px; padding: 16px; border-radius: 16px; border: 1px solid #e2e8f0; 
          transition: 0.2s; background: white;
        }
        .review-item.disabled { opacity: 0.6; background: #f8fafc; }
        .item-checkbox { cursor: pointer; padding-top: 4px; }
        .checked { color: #f97316; font-size: 20px; }
        .unchecked { width: 20px; height: 20px; border: 2px solid #cbd5e1; border-radius: 50%; }
        
        .item-fields { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .field-row { display: flex; gap: 12px; }
        .field-row.secondary { gap: 8px; }
        .review-item input {
          color: #0f172a !important;
          -webkit-text-fill-color: #0f172a;
          opacity: 1;
        }
        .review-item input::placeholder {
          color: #94a3b8;
          -webkit-text-fill-color: #94a3b8;
          opacity: 1;
        }
        .name-input { flex: 1; font-weight: 800; border: 1px solid #e2e8f0; outline: none; padding: 8px 10px; border-radius: 8px; font-size: 15px; background: #ffffff; min-width: 0; }
        .name-input:focus { background: white; box-shadow: 0 0 0 2px #fff7ed; }
        .price-input-wrap { display: flex; align-items: center; gap: 4px; background: #ffffff; padding: 8px 10px; border-radius: 8px; width: 120px; border: 1px solid #e2e8f0; }
        .price-input-wrap span { font-weight: 800; color: #64748b; }
        .price-input-wrap input { border: none; background: none; font-weight: 800; font-size: 14px; width: 100%; outline: none; }
        
        .cat-input, .desc-input { border: 1px solid #e2e8f0; background: #ffffff; padding: 8px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; outline: none; }
        .cat-input { width: 140px; color: #f97316; }
        .cat-input:not(:focus) { -webkit-text-fill-color: #f97316; }
        .desc-input { flex: 1; color: #334155; min-width: 0; }
        .cat-input:focus, .desc-input:focus { border-color: #e2e8f0; background: white; }

        .variant-section { margin-top: 6px; padding: 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 10px; }
        .variant-title { display: flex; align-items: center; gap: 8px; color: #475569; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
        .variant-title svg { color: #f97316; }
        .variant-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .variant-card-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
        .variant-template-input { border: 1px solid #e2e8f0; background: #ffffff; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-weight: 800; outline: none; }
        .required-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; color: #64748b; white-space: nowrap; }
        .required-toggle input { accent-color: #f97316; }
        .variant-options { display: flex; flex-direction: column; gap: 8px; }
        .variant-options-head { display: grid; grid-template-columns: minmax(0, 1fr) 110px 32px; gap: 8px; color: #94a3b8; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; padding: 0 2px; }
        .variant-option-row { display: grid; grid-template-columns: minmax(0, 1fr) 110px 32px; gap: 8px; align-items: center; }
        .variant-option-name { border: 1px solid #e2e8f0; background: #ffffff; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 700; outline: none; min-width: 0; }
        .variant-price-wrap { display: flex; align-items: center; gap: 4px; border: 1px solid #e2e8f0; background: #ffffff; border-radius: 8px; padding: 8px 10px; }
        .variant-price-wrap span { color: #64748b; font-weight: 800; font-size: 12px; }
        .variant-price-wrap input { border: none; outline: none; width: 100%; background: transparent; font-size: 12px; font-weight: 800; }
        .variant-option-delete { width: 32px; height: 32px; border: none; border-radius: 8px; background: #f8fafc; color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .variant-option-delete:hover { background: #fef2f2; color: #ef4444; }

        .item-delete { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 8px; font-size: 14px; border-radius: 8px; }
        .item-delete:hover { color: #ef4444; background: #fef2f2; }

        .import-error { background: #fef2f2; color: #b91c1c; padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        @media (max-width: 640px) {
          .review-item { gap: 10px; padding: 12px; }
          .field-row, .field-row.secondary, .variant-card-head, .variant-option-row, .variant-options-head { grid-template-columns: 1fr; display: grid; }
          .price-input-wrap, .cat-input { width: 100%; }
          .variant-options-head { display: none; }
          .variant-option-row { position: relative; padding-right: 40px; }
          .variant-option-delete { position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
        }
      `}</style>
    </CafeQRPopup>
  );
}
