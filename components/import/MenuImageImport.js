import React, { useState, useRef } from 'react';
import { FaImage, FaMagic, FaCheckCircle, FaExclamationCircle, FaTrash } from 'react-icons/fa';
import api from '../../utils/api';
import CafeQRPopup from '../CafeQRPopup';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      
      setItems(data.items.map(it => ({ ...it, selected: true })));
      setStep('review');
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  };

  const handleImport = async () => {
    const selectedItems = items.filter(it => it.selected);
    if (selectedItems.length === 0) return;

    setStep('importing');
    try {
      const payload = selectedItems.map(it => ({
        name: it.name,
        price: it.price,
        description: it.description,
        category: { name: it.category || 'General' },
        available: true,
        active: true
      }));

      const res = await api.post('/api/v1/products/bulk', payload);
      if (res.data.success) {
        onImported(res.data.data);
        onClose();
      } else {
        throw new Error(res.data.message || 'Failed to import products');
      }
    } catch (err) {
      setError(err.message);
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
        
        .item-fields { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .field-row { display: flex; gap: 12px; }
        .field-row.secondary { gap: 8px; }
        .name-input { flex: 1; font-weight: 700; border: none; outline: none; padding: 4px 8px; border-radius: 6px; font-size: 15px; background: #f8fafc; }
        .name-input:focus { background: white; box-shadow: 0 0 0 2px #fff7ed; }
        .price-input-wrap { display: flex; align-items: center; gap: 4px; background: #f8fafc; padding: 4px 8px; border-radius: 6px; width: 100px; }
        .price-input-wrap span { font-weight: 700; color: #94a3b8; }
        .price-input-wrap input { border: none; background: none; font-weight: 700; font-size: 14px; width: 100%; outline: none; }
        
        .cat-input, .desc-input { border: 1px solid transparent; background: #f8fafc; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; outline: none; }
        .cat-input { width: 140px; color: #f97316; }
        .desc-input { flex: 1; color: #64748b; }
        .cat-input:focus, .desc-input:focus { border-color: #e2e8f0; background: white; }

        .item-delete { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 8px; font-size: 14px; border-radius: 8px; }
        .item-delete:hover { color: #ef4444; background: #fef2f2; }

        .import-error { background: #fef2f2; color: #b91c1c; padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      `}</style>
    </CafeQRPopup>
  );
}
