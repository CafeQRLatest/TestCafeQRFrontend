import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import NiceSelect from './NiceSelect';
import CafeQRPopup from './CafeQRPopup';
import api from '../utils/api';
import { 
  FaBoxOpen, FaUtensils, FaCheckCircle, 
  FaTimes, FaCamera, FaLayerGroup, FaClock,
  FaWeightHanging, FaBarcode, FaUtensilSpoon, FaCogs, FaSlidersH,
  FaPlus, FaMinus, FaSearch, FaChevronRight, FaTags, FaMoneyBillWave
} from 'react-icons/fa';

export default function ProductManagementPopup({
  product: initialProduct = null,
  viewOnly: initialViewOnly = false,
  onClose,
  onSaveSuccess,
  categories: propCategories = null,
  uoms: propUoms = null,
  variantGroups: propVariantGroups = null,
  pricelists: propPricelists = null,
  products: propProducts = null,
}) {
  const { notify } = useNotification();
  const [viewOnly, setViewOnly] = useState(initialViewOnly);
  const [saving, setSaving] = useState(false);
  const [formTab, setFormTab] = useState('basic'); // 'basic', 'inventory', 'pricing', 'variants', 'upsells'
  const [pricingView, setPricingView] = useState('sales'); // 'sales', 'purchase'
  const [recipeSearch, setRecipeSearch] = useState('');
  const [inventoryEnabled, setInventoryEnabled] = useState(true);
  const [taxEnabled, setTaxEnabled] = useState(true);

  // Dropdown options data state
  const [categories, setCategories] = useState(propCategories || []);
  const [uoms, setUoms] = useState(propUoms || []);
  const [variantGroups, setVariantGroups] = useState(propVariantGroups || []);
  const [pricelists, setPricelists] = useState(propPricelists || []);
  const [products, setProducts] = useState(propProducts || []);

  // Fetch missing dropdown lists passively if not passed as props
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!propCategories || propCategories.length === 0) {
          const resp = await api.get('/api/v1/products/categories');
          if (active && resp.data.success) setCategories(resp.data.data || []);
        }
        if (!propUoms || propUoms.length === 0) {
          const resp = await api.get('/api/v1/products/uoms');
          if (active && resp.data.success) setUoms(resp.data.data || []);
        }
        if (!propPricelists || propPricelists.length === 0) {
          const resp = await api.get('/api/v1/purchasing/pricelists/type/SALE').catch(() => ({ data: { data: [] } }));
          if (active && resp.data.success) setPricelists(resp.data.data || []);
        }
        if (!propProducts || propProducts.length === 0) {
          const resp = await api.get('/api/v1/products');
          if (active && resp.data.success) setProducts(resp.data.data || []);
        }
        if (!propVariantGroups || propVariantGroups.length === 0) {
          const resp = await api.get('/api/v1/products/variants/groups');
          if (active && resp.data.success) {
            const groups = resp.data.data || [];
            const hydratedGroups = await Promise.all(groups.map(async (group) => {
              if (Array.isArray(group.options)) return group;
              try {
                const optionsResp = await api.get(`/api/v1/products/variants/groups/${group.id}/options`);
                return { ...group, options: optionsResp.data.data || group.options || [] };
              } catch {
                return { ...group, options: group.options || [] };
              }
            }));
            if (active) setVariantGroups(hydratedGroups);
          }
        }
      } catch (err) {
        console.warn("Failed to load dependency data for Product Popup:", err);
      }
    })();
    return () => { active = false; };
  }, [propCategories, propUoms, propPricelists, propProducts, propVariantGroups]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resp = await api.get('/api/v1/configurations');
        if (active && resp.data?.success) {
          setInventoryEnabled(resp.data.data.inventoryEnabled !== false);
          setTaxEnabled(resp.data.data.taxEnabled !== false);
        }
      } catch (err) {
        console.warn("Failed to load configuration in ProductManagementPopup:", err);
      }
    })();
    return () => { active = false; };
  }, []);

  // Conversion/Normalizer utilities
  const toNumber = (value, fallback = 0) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  };

  const toBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['y', 'yes', 'true', 'active', '1'].includes(normalized)) return true;
      if (['n', 'no', 'false', 'inactive', '0'].includes(normalized)) return false;
    }
    return fallback;
  };

  const findCategoryForProduct = (p) => {
    const productCategoryId = p.category?.id || p.categoryId;
    const productCategoryName = p.category?.name || p.categoryName;

    return categories.find(c => c.id === productCategoryId)
      || categories.find(c => productCategoryName && c.name?.toLowerCase() === productCategoryName.toLowerCase())
      || p.category
      || (productCategoryId || productCategoryName ? { id: productCategoryId || null, name: productCategoryName || 'Selected Category' } : null);
  };

  const findUomForProduct = (p) => {
    const productUomId = p.uom?.id || p.uomId;
    const productUomName = p.uom?.name || p.uomName;
    const productUomShortName = p.uom?.shortName || p.uomShortName;

    return uoms.find(u => u.id === productUomId)
      || uoms.find(u => productUomName && (u.name?.toLowerCase() === productUomName.toLowerCase() || u.shortName?.toLowerCase() === productUomName.toLowerCase()))
      || p.uom
      || (productUomId || productUomName ? { id: productUomId || null, name: productUomName || 'Selected Unit', shortName: productUomShortName } : null);
  };

  const normalizeVariantGroup = (group) => {
    if (!group) return null;
    const cachedGroup = variantGroups.find(g => g.id === group.id);
    return {
      ...cachedGroup,
      ...group,
      options: Array.isArray(group.options) && group.options.length > 0
        ? group.options
        : (cachedGroup?.options || [])
    };
  };

  const normalizeProductForDrawer = (p = {}) => {
    if (!p) {
      return {
        name: '', description: '', price: 0, isAvailable: true, imageUrl: '',
        productType: 'VEG', isVariant: false, isPackagedGood: false, isIngredient: false, productCode: '',
        taxRate: 0, taxCode: '', mrp: 0, costPrice: 0, barcode: '', minStockLevel: 0,
        kdsStation: '', uom: null, category: categories[0] || null, isActive: true,
        variantMappings: [], variantPricings: [], upsells: [], pricelistProducts: [], recipeLines: []
      };
    }

    const variantMappings = Array.isArray(p.variantMappings)
      ? p.variantMappings
          .map(mapping => {
            const variantGroup = normalizeVariantGroup(
              mapping.variantGroup
                || mapping.group
                || (mapping.variantGroupId ? { id: mapping.variantGroupId, name: 'Variant Group' } : null)
            );
            if (!variantGroup) return null;
            return {
              ...mapping,
              variantGroup,
              isRequired: toBoolean(mapping.isRequired, true)
            };
          })
          .filter(Boolean)
      : [];

    const variantPricings = Array.isArray(p.variantPricings)
      ? p.variantPricings.map(pricing => ({
          ...pricing,
          variantOption: pricing.variantOption
            || pricing.option
            || (pricing.variantOptionId ? { id: pricing.variantOptionId, name: 'Variant Option' } : null),
          additionalPrice: toNumber(pricing.additionalPrice, 0),
          price: toNumber(pricing.price, toNumber(pricing.additionalPrice, 0)),
          isActive: pricing.isActive ?? pricing.isactive ?? 'Y'
        }))
      : [];

    const upsells = Array.isArray(p.upsells)
      ? p.upsells
          .map(upsell => {
            const upsellProduct = upsell.upsellProduct
              || upsell.product
              || (upsell.upsellProductId ? { id: upsell.upsellProductId, name: 'Upsell Product' } : null);
            if (!upsellProduct) return null;
            return {
              ...upsell,
              upsellProduct,
              isActive: upsell.isActive ?? upsell.isactive ?? 'Y'
            };
          })
          .filter(Boolean)
      : [];

    const pricelistProducts = Array.isArray(p.pricelistProducts)
      ? p.pricelistProducts.map(item => ({
          ...item,
          pricelistId: item.pricelistId || item.pricelist?.id,
          price: toNumber(item.price, 0),
          isActive: item.isActive ?? item.isactive ?? 'Y'
        }))
      : [];

    const recipeLines = Array.isArray(p.recipeLines)
      ? p.recipeLines
          .map(line => {
             const ingredient = line.ingredient
               || (line.ingredientId ? { id: line.ingredientId, name: line.ingredientName || 'Ingredient Product' } : null);
             if (!ingredient) return null;
             return {
               ...line,
               ingredient,
               quantity: toNumber(line.quantity, 1),
               isActive: line.isActive ?? line.isactive ?? true
             };
          })
          .filter(Boolean)
      : [];

    return {
      ...p,
      name: p.name || '',
      description: p.description || '',
      price: toNumber(p.price ?? p.salePrice, 0),
      isAvailable: toBoolean(p.isAvailable ?? p.available, true),
      imageUrl: p.imageUrl || '',
      productType: p.productType || 'VEG',
      isVariant: toBoolean(p.isVariant, false),
      isPackagedGood: toBoolean(p.isPackagedGood, false),
      isIngredient: toBoolean(p.isIngredient, false),
      productCode: p.productCode || '',
      taxRate: toNumber(p.taxRate, 0),
      taxCode: p.taxCode || '',
      mrp: toNumber(p.mrp, 0),
      costPrice: toNumber(p.costPrice, 0),
      barcode: p.barcode || '',
      minStockLevel: toNumber(p.minStockLevel, 0),
      kdsStation: p.kdsStation || '',
      uom: findUomForProduct(p),
      category: findCategoryForProduct(p),
      isActive: toBoolean(p.isActive ?? p.isactive, true),
      variantMappings,
      variantPricings,
      upsells,
      pricelistProducts,
      recipeLines
    };
  };

  const [selectedProduct, setSelectedProduct] = useState(() => normalizeProductForDrawer(initialProduct));

  // Sync prop changes
  useEffect(() => {
    setSelectedProduct(normalizeProductForDrawer(initialProduct));
  }, [initialProduct, categories, uoms, variantGroups]);

  const normalizeById = (items = [], item) => {
    if (!item?.id) return items;
    return items.some(existing => existing.id === item.id) ? items : [...items, item];
  };

  const handleSaveProduct = async (e) => {
    if (e) e.preventDefault();

    if (selectedProduct.price === null || selectedProduct.price === undefined || isNaN(selectedProduct.price) || selectedProduct.price === '') {
      notify('error', 'Sale Price is required');
      return;
    }

    setSaving(true);
    try {
      const isNew = !selectedProduct.id;
      const url = isNew ? '/api/v1/products' : `/api/v1/products/${selectedProduct.id}`;
      const payload = {
        ...selectedProduct,
        variantMappings: selectedProduct.variantMappings || [],
        variantPricings: selectedProduct.variantPricings || [],
        upsells: selectedProduct.upsells || [],
        recipeLines: (selectedProduct.recipeLines || []).map(({ id, ingredient, quantity, isActive }) => ({
          id,
          ingredient: { id: ingredient.id },
          quantity: parseFloat(quantity) || 1,
          isActive: isActive !== false
        }))
      };
      const resp = await (isNew ? api.post(url, payload) : api.put(url, payload));
      if (resp.data.success) {
        notify('success', isNew ? "Product created!" : "Product updated!");
        onSaveSuccess?.(resp.data.data || payload);
        onClose();
      }
    } catch (err) {
      notify('error', err.response?.data?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const list = categories.filter(c => c.isActive !== false);
    return selectedProduct?.category?.id ? normalizeById(list, selectedProduct.category) : list;
  }, [categories, selectedProduct?.category]);

  const uomOptions = useMemo(() => {
    const list = uoms.filter(u => u.isActive !== false);
    return selectedProduct?.uom?.id ? normalizeById(list, selectedProduct.uom) : list;
  }, [uoms, selectedProduct?.uom]);

  return (
    <CafeQRPopup
      title={viewOnly ? 'Product Details' : (selectedProduct.id ? 'Edit Product' : 'New Product')}
      onClose={onClose}
      onSave={viewOnly ? null : handleSaveProduct}
      saveLabel={selectedProduct.id ? 'Update Product' : 'Create Product'}
      isSaving={saving}
      icon={FaBoxOpen}
    >
      <div className="drawer-tabs">
         <button className={`drawer-tab ${formTab === 'basic' ? 'active' : ''}`} onClick={() => setFormTab('basic')}>General</button>
         {inventoryEnabled && <button className={`drawer-tab ${formTab === 'inventory' ? 'active' : ''}`} onClick={() => setFormTab('inventory')}>Inventory</button>}
         <button className={`drawer-tab ${formTab === 'pricing' ? 'active' : ''}`} onClick={() => setFormTab('pricing')}>Pricing</button>
         <button className={`drawer-tab ${formTab === 'variants' ? 'active' : ''}`} onClick={() => setFormTab('variants')}>Variants</button>
         <button className={`drawer-tab ${formTab === 'upsells' ? 'active' : ''}`} onClick={() => setFormTab('upsells')}>Upsells</button>
      </div>

      <div className={`drawer-form ${viewOnly ? 'view-mode' : ''}`}>
         {viewOnly && (
           <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button className="erp-btn secondary sm" onClick={() => setViewOnly(false)}>Edit Info</button>
           </div>
         )}

         {formTab === 'basic' && (
           <>
             <div className="input-group">
               <label>Product Image</label>
               <div className="drawer-image-box">
                  {selectedProduct.imageUrl ? (
                    <div className="drawer-img-preview" style={{ backgroundImage: `url(${selectedProduct.imageUrl})` }}>
                       {!viewOnly && <button className="img-clear" onClick={() => setSelectedProduct({...selectedProduct, imageUrl: ''})}><FaTimes /></button>}
                    </div>
                  ) : (
                    <div className="drawer-img-placeholder"><FaCamera /><span>No image set</span></div>
                  )}
                  {!viewOnly && <input type="file" accept="image/*" onChange={(e) => {
                     const file = e.target.files[0];
                     if (!file) return;
                     const reader = new FileReader();
                     reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                           const canvas = document.createElement('canvas');
                           const MAX = 800;
                           let w = img.width, h = img.height;
                           if (w > MAX) { h *= MAX/w; w = MAX; }
                           canvas.width = w; canvas.height = h;
                           canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                           setSelectedProduct({...selectedProduct, imageUrl: canvas.toDataURL('image/jpeg', 0.7)});
                        };
                        img.src = ev.target.result;
                     };
                     reader.readAsDataURL(file);
                  }} />}
               </div>
             </div>

             <div className="erp-section">
               <div className="section-title"><FaBarcode /> Basic Info</div>
               <div className="input-row">
                  <div className="input-group"><label>Name</label><input value={selectedProduct.name} onChange={e => setSelectedProduct({...selectedProduct, name: e.target.value})} placeholder="e.g. Chicken Burger" /></div>
                  <div className="input-group"><label>Item Code</label><input value={selectedProduct.productCode || ''} onChange={e => setSelectedProduct({...selectedProduct, productCode: e.target.value})} placeholder="e.g. CB001" /></div>
               </div>
               <div className="input-group" style={{ marginTop: '16px' }}>
                  <label>Description</label>
                  <textarea value={selectedProduct.description || ''} onChange={e => setSelectedProduct({...selectedProduct, description: e.target.value})} placeholder="Describe product details..." rows={2} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', resize: 'vertical' }} />
               </div>
               <div className="input-row" style={{ marginTop: '16px' }}>
                  <div className="input-group">
                     <label>Category</label>
                      <NiceSelect 
                        options={categoryOptions.map(c => ({ value: c.id, label: c.name }))}
                        value={selectedProduct.category?.id || ''}
                        onChange={val => setSelectedProduct({...selectedProduct, category: categoryOptions.find(c => c.id === val)})}
                      />
                  </div>
                  <div className="input-group">
                     <label>Product Type</label>
                     <NiceSelect 
                       options={[{ value: 'VEG', label: 'Vegetarian' }, { value: 'NON_VEG', label: 'Non-Vegetarian' }, { value: 'EGG', label: 'Contains Egg' }]}
                       value={selectedProduct.productType || 'VEG'}
                       onChange={val => setSelectedProduct({...selectedProduct, productType: val})}
                     />
                  </div>
               </div>
               <div className="input-row" style={{ marginTop: '16px' }}>
                  <div className="input-group">
                     <label>Unit (UOM)</label>
                      <NiceSelect 
                        options={uomOptions.map(u => ({ value: u.id, label: u.name }))}
                        value={selectedProduct.uom?.id || ''}
                        onChange={val => setSelectedProduct({...selectedProduct, uom: uomOptions.find(u => u.id === val)})}
                      />
                  </div>
                  <div className="input-group">
                     <label>Barcode</label>
                     <input value={selectedProduct.barcode || ''} onChange={e => setSelectedProduct({...selectedProduct, barcode: e.target.value})} placeholder="e.g. 1234567890" />
                  </div>
               </div>
             </div>

             <div className="info-options-row" style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: inventoryEnabled ? '1fr 1fr' : '1fr', gap: '16px' }}>
                <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                   <label style={{ margin: 0 }}>Packaged Good</label>
                   <div className={`erp-switch ${selectedProduct.isPackagedGood ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isPackagedGood: !selectedProduct.isPackagedGood})}>
                      <div className="switch-knob"></div>
                   </div>
                </div>
                {inventoryEnabled && (
                  <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <label style={{ margin: 0 }}>Is Ingredient</label>
                     <div className={`erp-switch ${selectedProduct.isIngredient ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isIngredient: !selectedProduct.isIngredient})}>
                       <div className="switch-knob"></div>
                     </div>
                  </div>
                )}
             </div>

             {taxEnabled && selectedProduct.isPackagedGood && (
               <div className="erp-section" style={{ marginTop: '12px' }}>
                  <div className="input-row">
                     <div className="input-group"><label>Tax (%)</label><input type="number" value={selectedProduct.taxRate || 0} onChange={e => setSelectedProduct({...selectedProduct, taxRate: parseFloat(e.target.value)})} /></div>
                     <div className="input-group"><label>HSN Code</label><input value={selectedProduct.taxCode || ''} onChange={e => setSelectedProduct({...selectedProduct, taxCode: e.target.value})} placeholder="e.g. 2106" /></div>
                  </div>
               </div>
             )}
           </>
         )}

         {formTab === 'inventory' && (
           <>
             <div className="erp-section">
                <div className="section-title"><FaWeightHanging /> Inventory Details</div>
                <div className="input-row">
                   <div className="input-group"><label>Min Stock Level</label><input type="number" value={selectedProduct.minStockLevel || 0} onChange={e => setSelectedProduct({...selectedProduct, minStockLevel: parseInt(e.target.value)})} /></div>
                   <div style={{ flex: 1 }}></div>
                </div>
             </div>

             {!selectedProduct.isIngredient && (
                <div className="erp-section" style={{ marginTop: '16px' }}>
                   <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FaCogs /> Product Recipe (Ingredients)</span>
                      {(selectedProduct.recipeLines || []).length > 0 && (
                         <span style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#ea580c', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '999px', textTransform: 'uppercase' }}>
                            {(selectedProduct.recipeLines || []).length} {(selectedProduct.recipeLines || []).length === 1 ? 'Ingredient' : 'Ingredients'} Added
                         </span>
                      )}
                   </div>
                   <p className="section-desc">Add raw ingredients that compose this product. Products with recipes cannot be purchased directly.</p>
                   
                   <div className="recipe-selector-card">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '7px' }}>
                           <FaUtensilSpoon style={{ color: '#ea580c', fontSize: '10px' }} /> Add Recipe Ingredient
                        </label>
                        <div style={{ position: 'relative' }}>
                          <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '7px', padding: '5px 9px', gap: '7px', transition: 'border-color 0.2s' }}>
                            <FaSearch style={{ color: '#94a3b8', fontSize: '11px', flexShrink: 0 }} />
                            <input
                              type="text"
                              placeholder="Type to search ingredients..."
                              value={recipeSearch}
                              onChange={e => setRecipeSearch(e.target.value)}
                              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: 500, color: '#0f172a', width: '100%' }}
                            />
                            {recipeSearch && (
                              <button onClick={() => setRecipeSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}>
                                <FaTimes style={{ fontSize: '10px' }} />
                              </button>
                            )}
                          </div>
                          {recipeSearch.trim().length > 0 && (() => {
                            const suggestions = products.filter(p =>
                              p.isIngredient &&
                              p.id !== selectedProduct.id &&
                              !(selectedProduct.recipeLines || []).some(r => r.ingredient?.id === p.id) &&
                              p.name.toLowerCase().includes(recipeSearch.toLowerCase())
                            );
                            return (
                              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 20px rgba(15,23,42,0.1)', zIndex: 100, overflow: 'hidden', maxHeight: '180px', overflowY: 'auto' }}>
                                {suggestions.length === 0 ? (
                                  <div style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>No ingredients found</div>
                                ) : suggestions.map(p => (
                                  <div key={p.id}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      setSelectedProduct({
                                        ...selectedProduct,
                                        recipeLines: [...(selectedProduct.recipeLines || []), { ingredient: p, quantity: 1, isActive: true }]
                                      });
                                      setRecipeSearch('');
                                    }}
                                    style={{ padding: '7px 12px', fontSize: '12px', fontWeight: 600, color: '#0f172a', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                  >
                                    <FaUtensilSpoon style={{ color: '#ea580c', fontSize: '10px', flexShrink: 0 }} />
                                    <span style={{ flex: 1 }}>{p.name}</span>
                                    {p.uom?.shortName && <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '999px', textTransform: 'uppercase' }}>{p.uom.shortName}</span>}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                     </div>

                   <div className="mappings-list">
                      {(selectedProduct.recipeLines || []).map((r, idx) => (
                        <div key={idx} className="recipe-glass-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(226,232,240,0.6)', paddingBottom: '12px', marginBottom: '12px' }}>
                               <div style={{ display: 'flex', alignItems: 'center' }}>
                                  <span className="recipe-index-badge">{idx + 1}</span>
                                  <div>
                                    <strong style={{ fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>{r.ingredient?.name}</strong>
                                    <span className="recipe-uom-pill">
                                      {r.ingredient?.uomName || 'units'}
                                    </span>
                                  </div>
                               </div>
                               <button className="text-red" style={{ transition: 'transform 0.2s', padding: '6px', borderRadius: '50%' }} onClick={() => {
                                  setSelectedProduct({
                                     ...selectedProduct,
                                     recipeLines: selectedProduct.recipeLines.filter((_, i) => i !== idx)
                                  });
                               }}><FaTimes style={{ fontSize: '14px' }} /></button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                               <div style={{ flex: '1 1 200px' }}>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Quantity Required</label>
                                  <div className="qty-controls-container">
                                     <button className="qty-btn" type="button" onClick={() => {
                                        const newLines = [...selectedProduct.recipeLines];
                                        newLines[idx].quantity = Math.max(0, parseFloat((Math.max(0, r.quantity) - 1).toFixed(3)));
                                        setSelectedProduct({...selectedProduct, recipeLines: newLines});
                                     }}>
                                        <FaMinus />
                                     </button>
                                     <div className="qty-input-wrapper">
                                        <input 
                                          type="number" 
                                          step="any"
                                          value={r.quantity} 
                                          onChange={e => {
                                             const qty = parseFloat(e.target.value) || 0;
                                             const newLines = [...selectedProduct.recipeLines];
                                             newLines[idx].quantity = qty;
                                             setSelectedProduct({...selectedProduct, recipeLines: newLines});
                                          }}
                                          className="qty-styled-input"
                                        />
                                        <span className="qty-floating-badge">{r.ingredient?.uomShortName || r.ingredient?.uomName || 'qty'}</span>
                                     </div>
                                     <button className="qty-btn" type="button" onClick={() => {
                                        const newLines = [...selectedProduct.recipeLines];
                                        newLines[idx].quantity = parseFloat((Math.max(0, r.quantity) + 1).toFixed(3));
                                        setSelectedProduct({...selectedProduct, recipeLines: newLines});
                                     }}>
                                        <FaPlus />
                                     </button>
                                  </div>
                               </div>
                               <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'flex-end', height: '40px' }}>
                                  <div className="recipe-switch-row">
                                     <div 
                                        className={`erp-switch ${r.isActive !== false ? 'active' : ''}`} 
                                        onClick={() => {
                                           const newLines = [...selectedProduct.recipeLines];
                                           newLines[idx].isActive = r.isActive === false;
                                           setSelectedProduct({...selectedProduct, recipeLines: newLines});
                                        }}
                                     >
                                        <div className="switch-knob"></div>
                                     </div>
                                     <span className="recipe-switch-label" style={{ color: r.isActive !== false ? '#22c55e' : '#94a3b8' }}>
                                        {r.isActive !== false ? 'Active' : 'Inactive'}
                                     </span>
                                  </div>
                               </div>
                            </div>
                        </div>
                      ))}
                      {(selectedProduct.recipeLines || []).length === 0 && (
                         <div className="recipe-empty-state">
                            <div className="empty-icon-circle">
                               <FaUtensilSpoon className="pulse-icon" />
                            </div>
                            <h3>Craft Your Recipe</h3>
                            <p>Add raw ingredients that compose this product. You can customize quantities, toggle status, and build recipes easily.</p>
                            <div className="empty-state-hint">Use the selector above to choose an ingredient to start.</div>
                         </div>
                      )}
                   </div>
                </div>
             )}
           </>
         )}

         {formTab === 'pricing' && (
           <>
             <div className="erp-section">
                <div className="section-title"><FaTags /> Primary Pricing Strategy</div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                   <button 
                      className={`pricing-view-btn ${pricingView === 'sales' ? 'active' : ''}`} 
                      onClick={() => setPricingView('sales')}
                      style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: pricingView === 'sales' ? '#f0fdf4' : 'white', color: pricingView === 'sales' ? '#166534' : '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', borderColor: pricingView === 'sales' ? '#22c55e' : '#e2e8f0' }}
                   >
                      <FaMoneyBillWave style={{ marginRight: '8px' }} /> Sales Pricing
                   </button>
                   <button 
                      className={`pricing-view-btn ${pricingView === 'purchase' ? 'active' : ''}`} 
                      onClick={() => setPricingView('purchase')}
                      style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: pricingView === 'purchase' ? '#fff1f2' : 'white', color: pricingView === 'purchase' ? '#991b1b' : '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', borderColor: pricingView === 'purchase' ? '#ef4444' : '#e2e8f0' }}
                   >
                      <FaBoxOpen style={{ marginRight: '8px' }} /> Purchase Pricing
                   </button>
                </div>
                
                <div className="input-group">
                   <label>Default {pricingView === 'sales' ? 'Sale' : 'Purchase'} Pricelist</label>
                   <NiceSelect 
                      placeholder="Select primary pricelist..."
                      options={pricelists
                         .filter(pl => pl.pricelistType === (pricingView === 'sales' ? 'SALE' : 'PURCHASE'))
                         .map(pl => ({ value: pl.id, label: pl.name }))}
                      value={selectedProduct.defaultPricelistId || ''}
                      onChange={plid => setSelectedProduct({...selectedProduct, defaultPricelistId: plid})}
                   />
                </div>
             </div>

             {pricingView === 'sales' ? (
               <div className="erp-section" style={{ marginTop: '16px' }}>
                  <div className="section-title"><FaMoneyBillWave /> Global Sales Metrics</div>
                  <div className="input-row">
                     <div className="input-group"><label>Base Sale Price</label><input type="number" value={selectedProduct.price} onChange={e => setSelectedProduct({...selectedProduct, price: parseFloat(e.target.value)})} /></div>
                     <div className="input-group"><label>Global MRP</label><input type="number" value={selectedProduct.mrp || 0} onChange={e => setSelectedProduct({...selectedProduct, mrp: parseFloat(e.target.value)})} /></div>
                  </div>
                   {taxEnabled && (
                     <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 16 }}>
                         <label style={{ margin: 0 }}>Packaged Good (Apply Tax)</label>
                         <div className={`erp-switch ${selectedProduct.isPackagedGood ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isPackagedGood: !selectedProduct.isPackagedGood})}>
                            <div className="switch-knob"></div>
                         </div>
                     </div>
                   )}
                </div>
             ) : (
               <div className="erp-section" style={{ marginTop: '16px' }}>
                  <div className="section-title"><FaBoxOpen /> Procurement Standards</div>
                  <div className="input-group"><label>Standard Purchase Cost</label><input type="number" value={selectedProduct.costPrice || 0} onChange={e => setSelectedProduct({...selectedProduct, costPrice: parseFloat(e.target.value)})} /></div>
               </div>
             )}

             {taxEnabled && (
                <div className="erp-section" style={{ marginTop: '16px' }}>
                   <div className="section-title"><FaClock /> Shared Tax Config</div>
                   <div className="input-row">
                      <div className="input-group"><label>Tax Rate (%)</label><input type="number" value={selectedProduct.taxRate || 0} onChange={e => setSelectedProduct({...selectedProduct, taxRate: parseFloat(e.target.value)})} /></div>
                      <div className="input-group"><label>HSN / Tax Code</label><input value={selectedProduct.taxCode || ''} onChange={e => setSelectedProduct({...selectedProduct, taxCode: e.target.value})} placeholder="e.g. 2106" /></div>
                   </div>
                </div>
             )}

             <div className="erp-section" style={{ marginTop: '16px' }}>
                <div className="section-title"><FaTags /> Market Specific Prices ({pricingView === 'sales' ? 'Sales' : 'Purchase'})</div>
                <p className="section-desc">Override prices for specific {pricingView === 'sales' ? 'sales channels' : 'vendors'}.</p>
                
                <div className="input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                   {pricelists
                      .filter(pl => pl.pricelistType === (pricingView === 'sales' ? 'SALE' : 'PURCHASE'))
                      .map(pl => {
                         const override = (selectedProduct.pricelistProducts || []).find(pp => (pp.pricelistId === pl.id || pp.pricelist?.id === pl.id));
                         return (
                            <div key={pl.id} className="pl-input-card" style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                               <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{pl.name} {pl.isDefault ? '★' : ''}</label>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>₹</span>
                                  <input 
                                     type="number" 
                                     style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                     placeholder={pricingView === 'sales' ? selectedProduct.price : selectedProduct.costPrice}
                                     value={override ? override.price : ''}
                                     onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        const others = (selectedProduct.pricelistProducts || []).filter(pp => !(pp.pricelistId === pl.id || pp.pricelist?.id === pl.id));
                                        if (isNaN(val)) {
                                           setSelectedProduct({...selectedProduct, pricelistProducts: others});
                                        } else {
                                           setSelectedProduct({
                                              ...selectedProduct, 
                                              pricelistProducts: [...others, { pricelist: pl, pricelistId: pl.id, price: val, isActive: 'Y' }]
                                           });
                                        }
                                     }}
                                  />
                               </div>
                            </div>
                         );
                   })}
                   {pricelists.filter(pl => pl.pricelistType === (pricingView === 'sales' ? 'SALE' : 'PURCHASE')).length === 0 && (
                      <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '12px' }}>
                         No {pricingView} pricelists found. Add them in Price List Masters.
                      </div>
                   )}
                </div>
             </div>
           </>
         )}

         {formTab === 'variants' && (
           <>
             <div className="erp-section">
                <div className="section-title"><FaSlidersH /> Variant Mappings</div>
                <p className="section-desc">Manage customization groups for this product.</p>
                 <div className="mapping-selector" style={{ marginBottom: '16px' }}>
                    <label>Add Variant Group</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                       <NiceSelect 
                         placeholder="Search variant group to add..."
                         options={variantGroups
                           .filter(g => g.isActive !== false)
                           .filter(g => !(selectedProduct.variantMappings || []).some(m => m.variantGroup?.id === g.id))
                           .map(g => ({ value: g.id, label: g.name }))}
                         value=""
                         onChange={gid => {
                            const group = variantGroups.find(g => g.id === gid);
                            setSelectedProduct({
                               ...selectedProduct,
                               variantMappings: [...selectedProduct.variantMappings, { variantGroup: group, isRequired: true }]
                            });
                         }}
                       />
                    </div>
                 </div>

                <div className="mappings-list">
                   {(selectedProduct.variantMappings || []).map((m, idx) => {
                     const groupOptions = m.variantGroup?.options || [];
                     return (
                     <div key={idx} className="mapping-item-card variant-mapping-card">
                         <div className="item-header">
                            <div className="variant-group-heading">
                              <strong>{m.variantGroup?.name || 'Variant group'}</strong>
                              <div className="variant-group-meta">
                                <span>{groupOptions.length} option{groupOptions.length === 1 ? '' : 's'}</span>
                                <span>{m.isRequired ? 'Required' : 'Optional'}</span>
                              </div>
                            </div>
                            <button className="text-red" onClick={() => {
                               const groupOptionIds = groupOptions.map(o => o.id);
                               setSelectedProduct({
                                  ...selectedProduct,
                                  variantMappings: selectedProduct.variantMappings.filter((_, i) => i !== idx),
                                 variantPricings: (selectedProduct.variantPricings || []).filter(vp => !groupOptionIds.includes(vp.variantOption?.id))
                              });
                           }}><FaTimes /></button>
                        </div>
                        <div className="item-settings">
                           <label><input type="checkbox" checked={m.isRequired} onChange={e => {
                              const newMappings = [...selectedProduct.variantMappings];
                              newMappings[idx].isRequired = e.target.checked;
                              setSelectedProduct({...selectedProduct, variantMappings: newMappings});
                           }} /> Required selection</label>
                        </div>
                        
                         <div className="option-overrides">
                            <div className="option-overrides-title">Price Overrides</div>
                            {groupOptions.length === 0 ? (
                              <div className="variant-options-empty">
                                No options found for this variant group.
                              </div>
                            ) : (
                            <div className="variant-options-list">
                               {groupOptions.map(opt => {
                                  const pricing = (selectedProduct.variantPricings || []).find(vp => vp.variantOption?.id === opt.id);
                                  const currentVal = pricing ? pricing.overridePrice : opt.additionalPrice;
                                  return (
                                     <div key={opt.id} className="variant-option-row">
                                        <div className="variant-option-copy">
                                          <span className="variant-option-name">{opt.name}</span>
                                          <span className="variant-option-base">Base: ₹{opt.additionalPrice || 0}</span>
                                        </div>
                                        <div className="variant-option-controls">
                                           <label className="variant-enabled-label">
                                              <input
                                                type="checkbox"
                                                checked={pricing?.isAvailable !== false}
                                               onChange={e => {
                                                 const otherPricings = (selectedProduct.variantPricings || []).filter(vp => vp.variantOption?.id !== opt.id);
                                                 setSelectedProduct({
                                                   ...selectedProduct,
                                                   variantPricings: [...otherPricings, {
                                                     ...pricing,
                                                     variantOption: opt,
                                                     overridePrice: pricing ? pricing.overridePrice : currentVal,
                                                     isAvailable: e.target.checked
                                                   }]
                                                 });
                                               }}
                                              />
                                              Enabled
                                           </label>
                                           <span className="variant-currency">₹</span>
                                           <input 
                                              type="number" 
                                             className="variant-price-input"
                                             value={currentVal}
                                             onChange={e => {
                                                const newVal = parseFloat(e.target.value) || 0;
                                               const otherPricings = (selectedProduct.variantPricings || []).filter(vp => vp.variantOption?.id !== opt.id);
                                                setSelectedProduct({
                                                   ...selectedProduct,
                                                   variantPricings: [...otherPricings, {
                                                     ...pricing,
                                                     variantOption: opt,
                                                     overridePrice: newVal,
                                                     isAvailable: pricing?.isAvailable !== false
                                                   }]
                                                });
                                            }}
                                          />
                                        </div>
                                     </div>
                                  );
                               })}
                            </div>
                            )}
                      </div>
                    </div>
                     );
                     })}
                </div>
             </div>
           </>
         )}

         {formTab === 'upsells' && (
           <>
             <div className="erp-section">
                <div className="section-title"><FaPlus /> Upsells & Add-ons</div>
                <p className="section-desc">Suggest these products when this item is added to cart.</p>

                 <div className="mapping-selector" style={{ marginBottom: '16px' }}>
                    <label>Link Product (Upsell)</label>
                    <NiceSelect 
                      placeholder="Search product to link..."
                      options={products
                        .filter(p => p.id !== selectedProduct.id && !(selectedProduct.upsells || []).some(u => u.upsellProduct?.id === p.id))
                        .map(p => ({ value: p.id, label: p.name }))}
                      value=""
                      onChange={pid => {
                        const prod = products.find(p => p.id === pid);
                        setSelectedProduct({
                           ...selectedProduct,
                           upsells: [...selectedProduct.upsells, { upsellProduct: prod, isActive: true }]
                        });
                      }}
                    />
                 </div>

                <div className="mappings-list">
                   {(selectedProduct.upsells || []).map((u, idx) => (
                     <div key={idx} className="mapping-item-card horizontal">
                        <div className="card-img-sm" style={{ backgroundImage: `url(${u.upsellProduct?.imageUrl || ''})` }}></div>
                        <div className="item-info"><strong>{u.upsellProduct?.name}</strong><span>₹{u.upsellProduct?.price}</span></div>
                        <button className="text-red" onClick={() => {
                           setSelectedProduct({
                              ...selectedProduct,
                              upsells: selectedProduct.upsells.filter((_, i) => i !== idx)
                           });
                        }}><FaTimes /></button>
                     </div>
                   ))}
                </div>
             </div>
           </>
         )}
      </div>

      <style jsx>{`
        /* Premium Recipe Redesign Styles */
        .recipe-glass-card {
          background: rgba(255, 255, 255, 0.7) !important;
          backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(226, 232, 240, 0.8) !important;
          border-left: 3px solid #ea580c !important;
          border-radius: 10px !important;
          padding: 10px 12px !important;
          margin-bottom: 8px !important;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.03) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .recipe-glass-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.05) !important;
          border-color: #ea580c !important;
        }
        .recipe-index-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #0f172a;
          color: white;
          font-size: 9px;
          font-weight: 700;
          margin-right: 7px;
        }
        .recipe-uom-pill {
          display: inline-flex;
          align-items: center;
          padding: 1px 6px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-size: 9px;
          font-weight: 700;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-left: 6px;
        }
        .qty-controls-container {
          display: flex;
          align-items: center;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 2px;
          width: 100%;
          max-width: 160px;
          transition: all 0.2s;
        }
        .qty-controls-container:focus-within {
          border-color: #ea580c;
          box-shadow: 0 0 0 2px rgba(234, 88, 12, 0.12);
        }
        .qty-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: white;
          border-radius: 6px;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .qty-btn:hover {
          background: #ea580c;
          color: white;
        }
        .qty-input-wrapper {
          flex: 1;
          display: flex;
          align-items: center;
          position: relative;
          padding: 0 4px;
        }
        .qty-styled-input {
          width: 100%;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
          text-align: center;
          padding: 2px 24px 2px 2px;
          outline: none;
        }
        .qty-floating-badge {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 9px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          pointer-events: none;
          letter-spacing: 0.05em;
        }
        .recipe-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          text-align: center;
          margin-top: 10px;
        }
        .empty-icon-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #fff7ed;
          border: 1.5px solid #ffedd5;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
          box-shadow: 0 4px 10px rgba(234, 88, 12, 0.06);
        }
        .pulse-icon {
          color: #ea580c;
          font-size: 18px;
          animation: pulseIcon 2.5s infinite ease-in-out;
        }
        @keyframes pulseIcon {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 4px rgba(234, 88, 12, 0.4)); }
          100% { transform: scale(1); }
        }
        .recipe-empty-state h3 {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 4px;
        }
        .recipe-empty-state p {
          font-size: 11px;
          color: #64748b;
          max-width: 280px;
          line-height: 1.4;
          margin-bottom: 8px;
        }
        .empty-state-hint {
          font-size: 10px;
          color: #94a3b8;
          font-weight: 500;
          background: white;
          padding: 3px 10px;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
        }
        .recipe-selector-card {
          background: white;
          border: 1.5px solid #f97316;
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.04);
          margin-bottom: 12px;
          transition: all 0.3s;
        }
        .recipe-selector-card:hover {
          border-color: #ea580c;
          box-shadow: 0 4px 12px rgba(234, 88, 12, 0.08);
        }
        .recipe-switch-row {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .recipe-switch-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          transition: color 0.2s;
        }

        .drawer-form { display: flex; flex-direction: column; gap: 10px; }
        .erp-section { background: #fcfdfe; padding: 10px 12px; border-radius: 10px; border: 1px solid #f1f5f9; }
        .section-title { font-size: 10px; font-weight: 600; color: #64748b; margin-bottom: 10px; text-transform: uppercase; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 7px; }
        
        .input-group { display: flex; flex-direction: column; gap: 4px; }
        .input-group label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; }
        .input-group input, .input-group textarea { padding: 5px 9px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 12px; font-weight: 500; color: #0f172a; }
        .input-group input:focus { border-color: #3b82f6; outline: none; }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        .drawer-image-box { display: flex; flex-direction: column; gap: 8px; }
        .drawer-img-preview { width: 100%; height: 110px; border-radius: 8px; background-size: cover; background-position: center; border: 1px solid #e2e8f0; position: relative; }
        .drawer-img-placeholder { width: 100%; height: 80px; background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; gap: 4px; font-size: 11px; }
        .img-clear { position: absolute; top: 6px; right: 6px; background: white; border: none; width: 20px; height: 20px; border-radius: 50%; color: #ef4444; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .control-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #fcfdfe; border: 1px solid #f1f5f9; border-radius: 8px; margin-top: 6px; }
        .control-row label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0; }
        .erp-switch { width: 34px; height: 18px; background: #cbd5e1; border-radius: 100px; position: relative; cursor: pointer; transition: all 0.3s; }
        .erp-switch.active { background: #FF7A00; }
        .switch-knob { width: 13px; height: 13px; background: white; border-radius: 50%; position: absolute; top: 2.5px; left: 2.5px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .erp-switch.active .switch-knob { left: calc(100% - 15.5px); }

        .erp-btn { padding: 6px 12px; border-radius: 7px; font-weight: 600; font-size: 12px; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .erp-btn.primary { background: #FF7A00; color: white; box-shadow: 0 2px 4px rgba(255, 122, 0, 0.2); }
        .erp-btn.primary:hover { background: #ea580c; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(255, 122, 0, 0.25); }
        .erp-btn.secondary { background: white; color: #64748b; border: 1px solid #e2e8f0; }
        .erp-btn.secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
        .text-slate { color: #64748b; }
        .text-green { color: #22c55e; }
        .variant-options-list { display: flex; flex-direction: column; gap: 7px; margin-top: 7px; }
        .option-item { display: flex; align-items: center; gap: 8px; background: white; padding: 5px 7px; border-radius: 8px; border: 1px solid #f1f5f9; }
        .option-item input { flex: 1; border: 1px solid transparent; background: #f8fafc; padding: 4px 8px; border-radius: 5px; font-size: 12px; font-weight: 500; }
        .option-item input:focus { border-color: #3b82f6; background: white; }
        .option-price-input { display: flex; align-items: center; gap: 4px; background: #f1f5f9; padding: 3px 6px; border-radius: 5px; font-size: 11px; font-weight: 600; color: #475569; }
        .option-price-input input { width: 46px; border: none; background: transparent; padding: 2px; text-align: right; }
        .icon-btn { width: 24px; height: 24px; border: none; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 5px; }
        .icon-btn.delete { color: #94a3b8; }
        .icon-btn.delete:hover { background: #fef2f2; color: #ef4444; }
        .add-option-row { margin-top: 7px; display: flex; justify-content: flex-end; }
        .erp-btn.sm { padding: 4px 9px; font-size: 11px; }

        .text-green { color: #166534; }
        .text-red { color: #ef4444; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .hint-text { font-size: 11px; color: #64748b; margin-top: 6px; font-style: italic; }

        .drawer-tabs { display: flex; gap: 3px; padding: 3px; background: #f1f5f9; border-radius: 10px; margin-bottom: 14px; position: sticky; top: -20px; z-index: 10; align-self: flex-start; }
        .drawer-tab { padding: 5px 12px; border: none; background: none; font-size: 10px; font-weight: 700; color: #64748b; cursor: pointer; border-radius: 7px; text-transform: uppercase; transition: all 0.2s; }
        .drawer-tab.active { background: white; color: #FF7A00; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .drawer-tab:hover:not(.active) { color: #0f172a; }

        .mapping-selector { display: flex; flex-direction: column; gap: 6px; }
        .mappings-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .mapping-item-card { background: white; border: 1px solid #f1f5f9; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
        .variant-mapping-card { border-color: #e2e8f0; box-shadow: 0 8px 18px rgba(15,23,42,0.04); }
        .mapping-item-card.horizontal { display: flex; flex-direction: row; align-items: center; }
        .item-header { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
        .variant-group-heading { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .variant-group-heading strong { color: #0f172a; font-size: 14px; font-weight: 800; line-height: 1.2; }
        .variant-group-meta { display: flex; flex-wrap: wrap; gap: 6px; }
        .variant-group-meta span { color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .item-settings { background: #f8fafc; padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; }
        .item-settings label { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #475569; }
        .option-overrides { margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        .option-overrides-title { color: #334155; font-size: 11px; font-weight: 800; letter-spacing: 0; margin-bottom: 10px; text-transform: uppercase; }
        .variant-options-list { display: flex; flex-direction: column; gap: 8px; }
        .variant-option-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
        .variant-option-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .variant-option-name { color: #0f172a; font-size: 13px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; }
        .variant-option-base { color: #64748b; font-size: 11px; font-weight: 700; }
        .variant-option-controls { display: grid; grid-template-columns: auto auto 72px; align-items: center; gap: 6px; }
        .variant-enabled-label { display: flex; align-items: center; gap: 5px; color: #334155; font-size: 12px; font-weight: 700; white-space: nowrap; }
        .variant-currency { color: #0f172a; font-size: 12px; font-weight: 900; }
        .variant-price-input { width: 72px; padding: 6px 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; color: #0f172a; font-size: 12px; font-weight: 800; text-align: right; }
        .variant-price-input:focus { border-color: #FF7A00; box-shadow: 0 0 0 3px rgba(255,122,0,0.12); outline: none; }
        .variant-options-empty { color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px; font-size: 12px; font-weight: 700; }
        
        .card-img-sm { width: 44px; height: 44px; border-radius: 8px; background-size: cover; background-position: center; border: 1px solid #f1f5f9; flex-shrink: 0; }
        .item-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .item-info strong { font-size: 13px; color: #0f172a; }
        .item-info span { font-size: 12px; color: #64748b; font-weight: 600; }

        .section-desc { font-size: 11px; color: #94a3b8; margin-top: -8px; margin-bottom: 12px; }

        .view-mode input, .view-mode textarea { pointer-events: none; background: #f8fafc !important; border-color: transparent !important; }
        .view-mode .variant-option-name, .view-mode .variant-group-heading strong { color: #0f172a !important; opacity: 1; }
        .view-mode .variant-option-base, .view-mode .variant-enabled-label, .view-mode .variant-currency { opacity: 1; }
        .view-mode .variant-price-input { color: #0f172a !important; border-color: #e2e8f0 !important; }
        .view-mode :global(.nice-select) { pointer-events: none; opacity: 0.8; }
        
        @media (max-width: 768px) {
           .input-row, .info-options-row { grid-template-columns: 1fr !important; gap: 12px !important; }
           .drawer-tabs { width: 100%; overflow-x: auto; padding: 4px; gap: 4px; }
           .drawer-tab { padding: 6px 12px; font-size: 10px; flex-shrink: 0; }
           .erp-section { padding: 16px; border-radius: 12px; }
           .drawer-img-preview { height: 140px; }
        }

        @media (max-width: 640px) {
          .variant-option-row { grid-template-columns: 1fr; align-items: stretch; }
          .variant-option-controls { grid-template-columns: 1fr auto 82px; }
          .variant-price-input { width: 82px; }
        }
      `}</style>
    </CafeQRPopup>
  );
}
