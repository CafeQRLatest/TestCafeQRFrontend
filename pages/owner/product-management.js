import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { 
  FaBoxOpen, FaUtensils, FaFilter, FaCheckCircle, 
  FaExclamationCircle, FaTimes, FaCamera, FaLayerGroup, FaClock,
  FaWeightHanging, FaBarcode, FaUtensilSpoon, FaCogs, FaSlidersH,
  FaFileExcel, FaPlus, FaSearch, FaChevronRight, FaTags, FaMoneyBillWave
} from 'react-icons/fa';
import MenuImageImport from '../../components/import/MenuImageImport';
import MenuExcelImport from '../../components/import/MenuExcelImport';
import CafeQRPopup from '../../components/CafeQRPopup';

const getRequestErrorMessage = (err, fallback = 'Request failed') => {
  const data = err?.response?.data;
  const message = data?.message || data?.error || err?.message || fallback;
  return data?.errorReference ? `${message} (ref ${data.errorReference})` : message;
};

export default function ProductManagementPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']}>
      <ProductManagementContent />
    </RoleGate>
  );
}

function ProductManagementContent() {
  const { userRole } = useAuth();
  const { notify, showConfirm } = useNotification();
  const isMounted = React.useRef(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [variantGroups, setVariantGroups] = useState([]);
  const [pricelists, setPricelists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('products'); // 'products', 'categories', 'uoms', 'variants'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formTab, setFormTab] = useState('basic'); // 'basic', 'pricing', 'variants', 'upsells'
  const [pricingView, setPricingView] = useState('sales'); // 'sales', 'purchase'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedUom, setSelectedUom] = useState(null);
  const [selectedVariantGroup, setSelectedVariantGroup] = useState(null);
  const [currentGroupOptions, setCurrentGroupOptions] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [viewOnly, setViewOnly] = useState(false);
  const [tableCategoryFilter, setTableCategoryFilter] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [showImageImport, setShowImageImport] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);

  // ... (existing helper methods)

  const fetchVariantOptions = async (groupId) => {
    const resp = await api.get(`/api/v1/products/variants/groups/${groupId}/options`);
    if (resp.data.success) setCurrentGroupOptions(resp.data.data || []);
  };

  const handleEditVariantGroup = async (group) => {
    try {
      const resp = await api.get(`/api/v1/products/variants/groups/${group.id}/options`);
      setSelectedVariantGroup({ ...group, options: resp.data.data || [] });
    } catch (err) {
      setSelectedVariantGroup({ ...group, options: [] });
    }
  };

  const handleSaveVariantOption = async (option) => {
    setSaving(true);
    try {
      const isNew = !option.id;
      const url = isNew ? '/api/v1/products/variants/options' : `/api/v1/products/variants/options/${option.id}`;
      const payload = { ...option, groupId: selectedVariantGroup.id, group: { id: selectedVariantGroup.id } };
      const resp = await (isNew ? api.post(url, payload) : api.put(url, payload));
      if (resp.data.success) {
        notify('success', "Variant option saved!");
        fetchVariantOptions(selectedVariantGroup.id);
      }
    } catch (err) {
      notify('error', "Failed to save option");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVariantOption = async (id) => {
    showConfirm({
      title: "Remove Option",
      message: "Are you sure you want to remove this variant option?",
      onConfirm: async () => {
        await api.delete(`/api/v1/products/variants/options/${id}`);
        fetchVariantOptions(selectedVariantGroup.id);
      }
    });
  };
  const toggleSelectItem = (id) => {
    setSelectedItemIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = (ids) => {
    setSelectedItemIds(selectedItemIds.length === ids.length ? [] : ids);
  };

  const handleBulkStatus = async (status) => {
    setSaving(true);
    try {
      await Promise.all(selectedItemIds.map(id => api.put(`/api/v1/products/${id}/status`, { isActive: status })));
      notify('success', `Updated ${selectedItemIds.length} items`);
      fetchProducts();
      setSelectedItemIds([]);
    } catch (err) {
      notify('error', "Bulk update failed");
    } finally {
      setSaving(false);
    }
  };





  const handleToggleActive = async (product) => {
    try {
      const resp = await api.put(`/api/v1/products/${product.id}/status`, { isActive: !product.isActive });
      if (resp.data.success) {
        notify('success', product.isActive ? "Marked out of stock" : "Marked available");
        fetchProducts();
      }
    } catch (err) {
      notify('error', "Failed to update status");
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchInitialData();
    return () => { isMounted.current = false; };
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const coreResults = await Promise.allSettled([
        fetchProducts(),
        fetchCategories(),
        fetchUoms(),
        fetchVariantGroups()
      ]);
    } catch (err) {
      if (isMounted.current) {
        console.error("Failed to load ERP data:", err);
        notify('error', getRequestErrorMessage(err, "Failed to sync ERP catalog."));
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const fetchProducts = async () => {
    const resp = await api.get('/api/v1/products');
    console.log("===> [DEBUG] fetchProducts response:", resp.data);
    if (resp.data.success) {
        setProducts(resp.data.data || []);
    } else {
        toast.error(resp.data.message || "Failed to load products");
    }
  };

  const fetchCategories = async () => {
    const resp = await api.get('/api/v1/products/categories');
    if (resp.data.success) setCategories(resp.data.data || []);
  };

  const fetchUoms = async () => {
    const resp = await api.get('/api/v1/products/uoms');
    if (resp.data.success) setUoms(resp.data.data || []);
  };

  const fetchVariantGroups = async () => {
    const resp = await api.get('/api/v1/products/variants/groups');
    if (resp.data.success) {
      const groups = resp.data.data || [];
      const hydratedGroups = await Promise.all(groups.map(async (group) => {
        if (Array.isArray(group.options)) {
          return group;
        }

        try {
          const optionsResp = await api.get(`/api/v1/products/variants/groups/${group.id}/options`);
          return { ...group, options: optionsResp.data.data || group.options || [] };
        } catch {
          return { ...group, options: group.options || [] };
        }
      }));
      setVariantGroups(hydratedGroups);
    }
  };

  const normalizeById = (items = [], item) => {
    if (!item?.id) return items;
    return items.some(existing => existing.id === item.id) ? items : [...items, item];
  };

  const findCategoryForProduct = (product) => {
    const productCategoryId = product.category?.id || product.categoryId;
    const productCategoryName = product.category?.name || product.categoryName;

    return categories.find(c => c.id === productCategoryId)
      || categories.find(c => productCategoryName && c.name?.toLowerCase() === productCategoryName.toLowerCase())
      || product.category
      || (productCategoryId || productCategoryName ? { id: productCategoryId || null, name: productCategoryName || 'Selected Category' } : null);
  };

  const findUomForProduct = (product) => {
    const productUomId = product.uom?.id || product.uomId;
    const productUomName = product.uom?.name || product.uomName;
    const productUomShortName = product.uom?.shortName || product.uomShortName;

    return uoms.find(u => u.id === productUomId)
      || uoms.find(u => productUomName && (u.name?.toLowerCase() === productUomName.toLowerCase() || u.shortName?.toLowerCase() === productUomName.toLowerCase()))
      || product.uom
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
        upsells: selectedProduct.upsells || []
      };
      const resp = await (isNew ? api.post(url, payload) : api.put(url, payload));
      if (resp.data.success) {
        notify('success', isNew ? "Product created!" : "Product updated!");
        fetchProducts();
        setSelectedProduct(null);
        setFormTab('basic');
      }
    } catch (err) {
      notify('error', err.response?.data?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const isNew = !selectedCategory.id;
      const url = isNew ? '/api/v1/products/categories' : `/api/v1/products/categories/${selectedCategory.id}`;
      const resp = await (isNew ? api.post(url, selectedCategory) : api.put(url, selectedCategory));
      if (resp.data.success) {
        notify('success', isNew ? "Category created!" : "Category updated!");
        fetchCategories();
        setSelectedCategory(null);
      }
    } catch (err) {
      notify('error', "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUom = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const isNew = !selectedUom.id;
      const url = isNew ? '/api/v1/products/uoms' : `/api/v1/products/uoms/${selectedUom.id}`;
      const resp = await (isNew ? api.post(url, selectedUom) : api.put(url, selectedUom));
      if (resp.data.success) {
        notify('success', isNew ? "UOM created!" : "UOM updated!");
        fetchUoms();
        setSelectedUom(null);
      }
    } catch (err) {
      notify('error', "Failed to save UOM");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVariantGroup = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const isNew = !selectedVariantGroup.id;
      const url = isNew ? '/api/v1/products/variants/groups' : `/api/v1/products/variants/groups/${selectedVariantGroup.id}`;
      const resp = await (isNew ? api.post(url, selectedVariantGroup) : api.put(url, selectedVariantGroup));
      if (resp.data.success) {
        notify('success', isNew ? "Variant Group created!" : "Variant Group updated!");
        fetchVariantGroups();
        setSelectedVariantGroup(null);
      }
    } catch (err) {
      notify('error', "Failed to save Variant Group");
    } finally {
      setSaving(false);
    }
  };

  const startNewProduct = () => {
    setSelectedProduct({
      name: '', description: '', price: 0, isAvailable: true, imageUrl: '',
      productType: 'VEG', isVariant: false, isPackagedGood: false, isIngredient: false, productCode: '',
      taxRate: 0, taxCode: '', mrp: 0, costPrice: 0, barcode: '', minStockLevel: 0,
      kdsStation: '', uom: null, category: categories[0] || null, isActive: true,
      variantMappings: [], variantPricings: [], upsells: [], pricelistProducts: []
    });
    setViewOnly(false);
    setFormTab('basic');
  };

  const openProduct = async (product, readOnly = true) => {
    setSelectedProduct(normalizeProductForDrawer(product));
    setViewOnly(readOnly);
    setFormTab('basic');

    if (!product?.id) return;

    try {
      const resp = await api.get(`/api/v1/products/${product.id}`);
      if (resp.data.success) {
        const normalizedProduct = normalizeProductForDrawer(resp.data.data);
        setSelectedProduct(normalizedProduct);
        if (normalizedProduct.category?.id) {
          setCategories(prev => normalizeById(prev, normalizedProduct.category));
        }
        if (normalizedProduct.uom?.id) {
          setUoms(prev => normalizeById(prev, normalizedProduct.uom));
        }
        if (normalizedProduct.variantMappings?.length) {
          setVariantGroups(prev => {
            const next = [...prev];
            normalizedProduct.variantMappings.forEach(mapping => {
              if (mapping.variantGroup?.id && !next.some(group => group.id === mapping.variantGroup.id)) {
                next.push(mapping.variantGroup);
              }
            });
            return next;
          });
        }
      }
    } catch (err) {
      console.warn("Failed to load product details:", err);
    }
  };

  if (loading) return <div className="loading-state"><span>Syncing ERP Catalog...</span></div>;

  const selectedCategoryFilter = categories.find(c => c.id === tableCategoryFilter);
  const filteredProducts = products.filter(p => 
    (!tableCategoryFilter || p.category?.id === tableCategoryFilter) && 
    (!tableStatusFilter || (tableStatusFilter === 'ACTIVE' ? p.isActive !== false : p.isActive === false)) &&
    (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.productCode && p.productCode.toLowerCase().includes(searchTerm.toLowerCase())))
  );
  const categoryOptions = selectedProduct?.category?.id
    ? normalizeById(categories.filter(c => c.isActive !== false), selectedProduct.category)
    : categories.filter(c => c.isActive !== false);
  const uomOptions = selectedProduct?.uom?.id
    ? normalizeById(uoms.filter(u => u.isActive !== false), selectedProduct.uom)
    : uoms.filter(u => u.isActive !== false);

  return (
    <DashboardLayout title="Product Management" showBack={true}>
      <div className="erp-container">
        {/* Summary Row removed as per user request */}
        
        <div className="erp-main-card">
          <header className="erp-header">
            <div className="erp-tabs">
              <button className={`erp-tab ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>Products</button>
              <button className={`erp-tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>Categories</button>
              <button className={`erp-tab ${activeTab === 'uoms' ? 'active' : ''}`} onClick={() => setActiveTab('uoms')}>UOMs</button>
              <button className={`erp-tab ${activeTab === 'variants' ? 'active' : ''}`} onClick={() => setActiveTab('variants')}>Variants</button>
            </div>
            <div className="erp-actions">
               {activeTab === 'products' ? (
                 <>
                   <button className="erp-btn primary" onClick={() => setShowImageImport(true)}>
                     <FaCamera /> <span className="btn-label">Import from Image</span> <span className="ai-tag">AI</span>
                   </button>
                   <button className="erp-btn primary" onClick={() => setShowExcelImport(true)}>
                     <FaFileExcel /> <span className="btn-label">Import from Excel</span>
                   </button>
                   <button className="erp-btn primary" onClick={startNewProduct}><FaPlus /> <span className="btn-label">New Product</span></button>
                 </>
               ) : activeTab === 'categories' ? (
                 <button className="erp-btn primary" onClick={() => setSelectedCategory({ name: '', description: '', isActive: true })}><FaPlus /> New Category</button>
               ) : activeTab === 'uoms' ? (
                 <button className="erp-btn primary" onClick={() => setSelectedUom({ name: '', shortName: '', isActive: true, isDefault: false, uomPrecision: 0 })}><FaPlus /> New UOM</button>
               ) : (
                 <button className="erp-btn primary" onClick={() => setSelectedVariantGroup({ name: '', isActive: true, options: [] })}><FaPlus /> New Variant Group</button>
               )}
            </div>
          </header>

          <div className="erp-filter-bar">
             <div className="erp-search-field">
                <FaSearch />
                <input placeholder={`Search ${activeTab}...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
             </div>
             <div className="erp-filters">
                <NiceSelect 
                  options={[{ value: '', label: 'All Status' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]}
                  value={tableStatusFilter}
                  onChange={setTableStatusFilter}
                />
                {activeTab === 'products' && (
                   <NiceSelect 
                     options={[{ value: '', label: 'All Categories' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
                     value={tableCategoryFilter}
                     onChange={setTableCategoryFilter}
                   />
                )}
             </div>
             {selectedItemIds.length > 0 && (
               <div className="bulk-toolbar">
                  <span>{selectedItemIds.length} selected</span>
                  <button className="toolbar-btn" onClick={() => handleBulkStatus(true)}>Mark Available</button>
                  <button className="toolbar-btn" onClick={() => handleBulkStatus(false)}>Out of Stock</button>
               </div>
             )}
          </div>

          <div className="erp-table-wrapper desk-only">
             <table className="erp-table">
                {activeTab === 'products' && (
                   <>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                           <input type="checkbox" checked={selectedItemIds.length === filteredProducts.length && filteredProducts.length > 0} onChange={() => toggleSelectAll(filteredProducts.map(p => p.id))} />
                        </th>
                        <th>Image</th><th>Code</th><th>Name</th><th>Category</th><th>Price</th><th>Type</th><th>Remark</th><th>Status</th><th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map(p => (
                        <tr key={p.id} onClick={(e) => {
                          if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                            openProduct(p, true);
                          }
                        }} className={`clickable-row ${selectedItemIds.includes(p.id) ? 'row-selected' : ''}`}>
                          <td onClick={e => e.stopPropagation()}>
                             <input type="checkbox" checked={selectedItemIds.includes(p.id)} onChange={() => toggleSelectItem(p.id)} />
                          </td>
                          <td><div className="table-img" style={{ backgroundImage: `url(${p.imageUrl || 'https://via.placeholder.com/40'})` }}></div></td>
                          <td className="code-cell">{p.productCode || '-'}</td>
                          <td><span className="name-text">{p.name}</span></td>
                          <td>{p.category?.name || 'N/A'}</td>
                          <td>₹{p.price} <small>/ {p.uom?.shortName || 'Unit'}</small></td>
                          <td><span className={`type-badge ${p.productType?.toLowerCase().replace('_', '-')}`}>{p.productType || 'N/A'}</span></td>
                          <td title={p.description}>
                              {p.description || '-'}
                           </td>
                           <td className="hidden-ingredient" style={{ display: 'none' }}>
                              {p.isIngredient ? (
                                <div className="type-badge" style={{ backgroundColor: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8', borderRadius: '6px', fontSize: '10px' }}>
                                   <FaUtensilSpoon style={{ marginRight: '4px' }}/> INGREDIENT
                                </div>
                              ) : '-'}
                           </td>
                          <td>
                             <span className={`status-pill ${p.isActive ? 'active' : 'inactive'}`} onClick={(e) => { e.stopPropagation(); handleToggleActive(p); }}>
                                <span className="status-dot"></span>
                                {p.isActive ? 'Available' : 'Out of Stock'}
                             </span>
                          </td>
                          <td onClick={e => e.stopPropagation()} className="row-actions">
                             <button className="table-btn" title="View" onClick={() => openProduct(p, true)}><FaSearch /></button>
                             <button className="table-btn" title="Edit" onClick={() => openProduct(p, false)}><FaSlidersH /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                   </>
                )}
                {activeTab === 'categories' && (
                   <>
                    <thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Edit</th></tr></thead>
                    <tbody>
                       {categories.filter(c => (!tableStatusFilter || (tableStatusFilter === 'ACTIVE' ? c.isActive !== false : c.isActive === false)) && c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                        <tr key={c.id} onClick={() => setSelectedCategory(c)} className="clickable-row">
                          <td><span className="name-text">{c.name}</span></td><td>{c.description || '-'}</td>
                          <td>
                             <span className={`status-pill ${c.isActive ? 'active' : 'inactive'}`}>
                                <span className="status-dot"></span>
                                {c.isActive ? 'Active' : 'Inactive'}
                             </span>
                          </td>
                          <td onClick={e => e.stopPropagation()}><button className="table-btn" onClick={() => setSelectedCategory(c)}><FaChevronRight /></button></td>
                        </tr>
                      ))}
                    </tbody>
                   </>
                )}
                {activeTab === 'uoms' && (
                   <>
                    <thead><tr><th>Unit Name</th><th>Symbol</th><th>Default</th><th>Status</th><th>Edit</th></tr></thead>
                    <tbody>
                       {uoms.filter(u => (!tableStatusFilter || (tableStatusFilter === 'ACTIVE' ? u.isActive !== false : u.isActive === false)) && u.name.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                        <tr key={u.id} onClick={() => setSelectedUom(u)} className="clickable-row">
                          <td><span className="name-text">{u.name}</span></td><td>{u.shortName}</td>
                          <td>{u.isDefault ? <FaCheckCircle className="text-green" /> : '-'}</td>
                          <td>
                             <span className={`status-pill ${u.isActive ? 'active' : 'inactive'}`}>
                                 <span className="status-dot"></span>
                                 {u.isActive ? 'Active' : 'Inactive'}
                             </span>
                          </td>
                          <td onClick={e => e.stopPropagation()}><button className="table-btn" onClick={() => setSelectedUom(u)}><FaChevronRight /></button></td>
                        </tr>
                      ))}
                    </tbody>
                   </>
                )}
                {activeTab === 'variants' && (
                   <>
                    <thead><tr><th>Group Name</th><th>Options</th><th>Status</th><th>Edit</th></tr></thead>
                    <tbody>
                       {variantGroups.filter(v => (!tableStatusFilter || (tableStatusFilter === 'ACTIVE' ? v.isActive !== false : v.isActive === false)) && v.name.toLowerCase().includes(searchTerm.toLowerCase())).map(v => (
                        <tr key={v.id} onClick={() => handleEditVariantGroup(v)} className="clickable-row">
                          <td><span className="name-text">{v.name}</span></td>
                           <td>
                              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                 {v.options && v.options.map((opt, i) => (
                                    <span key={i} className="type-badge veg" style={{ textTransform: 'none', fontSize: '11px', padding: '2px 6px' }}>{opt.name}</span>
                                 ))}
                                 {(!v.options || v.options.length === 0) && <span style={{ color: '#94a3b8', fontSize: '12px' }}>No options</span>}
                              </div>
                           </td>
                          <td>
                             <span className={`status-pill ${v.isActive ? 'active' : 'inactive'}`}>
                                 <span className="status-dot"></span>
                                 {v.isActive ? 'Active' : 'Inactive'}
                             </span>
                          </td>
                          <td onClick={e => e.stopPropagation()}><button className="table-btn" onClick={() => handleEditVariantGroup(v)}><FaChevronRight /></button></td>
                        </tr>
                      ))}
                    </tbody>
                   </>
                )}
             </table>
          </div>

          <div className="erp-mobile-list mobile-only">
             {activeTab === 'products' && filteredProducts.map(p => (
               <div key={p.id} className={`mobile-card ${selectedItemIds.includes(p.id) ? 'row-selected' : ''}`} onClick={() => openProduct(p, true)}>
                  <div className="card-check" onClick={e => { e.stopPropagation(); toggleSelectItem(p.id); }}>
                     <input type="checkbox" checked={selectedItemIds.includes(p.id)} readOnly />
                  </div>
                  <div className="card-img" style={{ backgroundImage: `url(${p.imageUrl || 'https://via.placeholder.com/40'})` }}></div>
                  <div className="card-info">
                     <span className="card-name">{p.name} {p.isIngredient && <FaUtensilSpoon style={{ color: '#db2777', fontSize: '10px', marginLeft: '4px' }}/>}</span>
                     <span className="card-sub">{p.category?.name || p.categoryName || 'No Category'} • ₹{p.price}</span>
                     {p.hasVariants && <span className="variant-badge mobile">{p.variantCount || 1} variant{(p.variantCount || 1) > 1 ? 's' : ''}</span>}
                  </div>
                  <div className="card-action" onClick={e => { e.stopPropagation(); /* could add a small menu here */ }}>
                     <FaChevronRight />
                  </div>
               </div>
             ))}
              {activeTab === 'categories' && categories.filter(c => (!tableStatusFilter || (tableStatusFilter === 'ACTIVE' ? c.isActive !== false : c.isActive === false)) && c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
               <div key={c.id} className="mobile-card" onClick={() => setSelectedCategory(c)}>
                  <div className="card-info">
                     <span className="card-name">{c.name}</span>
                     <span className="card-sub">{c.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="card-action"><FaChevronRight /></div>
               </div>
             ))}
              {activeTab === 'uoms' && uoms.filter(u => (!tableStatusFilter || (tableStatusFilter === 'ACTIVE' ? u.isActive !== false : u.isActive === false)) && u.name.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
               <div key={u.id} className="mobile-card" onClick={() => setSelectedUom(u)}>
                  <div className="card-info">
                     <span className="card-name">{u.name} ({u.shortName})</span>
                     <span className="card-sub">{u.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="card-action"><FaChevronRight /></div>
               </div>
             ))}
              {activeTab === 'variants' && variantGroups.filter(v => (!tableStatusFilter || (tableStatusFilter === 'ACTIVE' ? v.isActive !== false : v.isActive === false)) && v.name.toLowerCase().includes(searchTerm.toLowerCase())).map(v => (
               <div key={v.id} className="mobile-card" onClick={() => handleEditVariantGroup(v)}>
                  <div className="card-info">
                     <span className="card-name">{v.name}</span>
                     <span className="card-sub">{v.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="card-action"><FaChevronRight /></div>
               </div>
             ))}
          </div>
           </div>

        {/* Entity Management Popups */}
        {selectedProduct && (
          <CafeQRPopup
            title={viewOnly ? 'Product Details' : (selectedProduct.id ? 'Edit Product' : 'New Product')}
            onClose={() => { setSelectedProduct(null); setViewOnly(false); setFormTab('basic'); }}
            onSave={viewOnly ? null : handleSaveProduct}
            saveLabel={selectedProduct.id ? 'Update Product' : 'Create Product'}
            isSaving={saving}
            icon={FaBoxOpen}
          >
            <div className={`drawer-tabs`}>
               <button className={`drawer-tab ${formTab === 'basic' ? 'active' : ''}`} onClick={() => setFormTab('basic')}>General</button>
               <button className={`drawer-tab ${formTab === 'inventory' ? 'active' : ''}`} onClick={() => setFormTab('inventory')}>Inventory</button>
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
                {formTab === 'basic' && (<>
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
                 </div> {/* Closing the input-group for Product Image */}
                 <div className="erp-section">
                    <div className="section-title"><FaBarcode /> Basic Info</div>
                    <div className="input-row">
                       <div className="input-group"><label>Name</label><input value={selectedProduct.name} onChange={e => setSelectedProduct({...selectedProduct, name: e.target.value})} placeholder="e.g. Chicken Burger" /></div>
                       <div className="input-group"><label>Item Code</label><input value={selectedProduct.productCode || ''} onChange={e => setSelectedProduct({...selectedProduct, productCode: e.target.value})} placeholder="e.g. CB001" /></div>
                    </div> {/* Closing the input-row for Name/Code */}
                    <div className="input-group" style={{ marginTop: '16px' }}>
                       <label>Description</label>
                       <textarea value={selectedProduct.description || ''} onChange={e => setSelectedProduct({...selectedProduct, description: e.target.value})} placeholder="Describe product details..." rows={2} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', resize: 'vertical' }} />
                    </div> {/* Closing the input-group for Description */}
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
                    </div> {/* Closing the input-row for Category/Product Type */}
                 </div> {/* Closing the erp-section for Basic Info */}

                 <div className="erp-section" style={{ marginTop: '16px' }}>
                    <div className="section-title"><FaClock /> Pricing & Tax</div>
                    <div className="input-row">
                       <div className="input-group"><label>Sale Price</label><input type="number" value={selectedProduct.price} onChange={e => setSelectedProduct({...selectedProduct, price: parseFloat(e.target.value)})} /></div>
                       <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ margin: 0 }}>Packaged Good</label>
                          <div className={`erp-switch ${selectedProduct.isPackagedGood ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isPackagedGood: !selectedProduct.isPackagedGood})}>
                             <div className="switch-knob"></div>
                          </div>
                       </div>
                    </div>
                    {selectedProduct.isPackagedGood && (
                      <div className="input-row" style={{ marginTop: '16px' }}>
                         <div className="input-group"><label>Tax (%)</label><input type="number" value={selectedProduct.taxRate || 0} onChange={e => setSelectedProduct({...selectedProduct, taxRate: parseFloat(e.target.value)})} /></div>
                         <div className="input-group"><label>HSN Code</label><input value={selectedProduct.taxCode || ''} onChange={e => setSelectedProduct({...selectedProduct, taxCode: e.target.value})} placeholder="e.g. 2106" /></div>
                      </div>
                    )}
                 </div> {/* Closing the erp-section for Pricing & Tax */}

                 <div className="info-options-row" style={{ marginTop: '16px' }}>
                    <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <label style={{ margin: 0 }}>Availability</label>
                       <div className={`erp-switch ${selectedProduct.isActive ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isActive: !selectedProduct.isActive})}>
                         <div className="switch-knob"></div>
                       </div>
                    </div>
                    <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <label style={{ margin: 0 }}>Is Ingredient</label>
                       <div className={`erp-switch ${selectedProduct.isIngredient ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isIngredient: !selectedProduct.isIngredient})}>
                         <div className="switch-knob"></div>
                       </div>
                    </div>
                 </div> {/* Closing the info-options-row */}
               </>)}

               {formTab === 'inventory' && (<>
                 <div className="erp-section">
                    <div className="section-title"><FaWeightHanging /> Inventory Details</div>
                    <div className="input-row">
                       <div className="input-group">
                          <label>Unit (UOM)</label>
                           <NiceSelect 
                             options={uomOptions.map(u => ({ value: u.id, label: u.name }))}
                             value={selectedProduct.uom?.id || ''}
                             onChange={val => setSelectedProduct({...selectedProduct, uom: uomOptions.find(u => u.id === val)})}
                           />
                       </div>
                       <div className="input-group"><label>Min Stock Level</label><input type="number" value={selectedProduct.minStockLevel || 0} onChange={e => setSelectedProduct({...selectedProduct, minStockLevel: parseInt(e.target.value)})} /></div>
                    </div>
                    <div className="input-group" style={{ marginTop: '16px' }}>
                       <label>Barcode</label>
                       <input value={selectedProduct.barcode || ''} onChange={e => setSelectedProduct({...selectedProduct, barcode: e.target.value})} placeholder="e.g. 1234567890" />
                    </div>
                 </div>
               </>)}

                {formTab === 'pricing' && (<>
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
                       <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 16 }}>
                           <label style={{ margin: 0 }}>Packaged Good (Apply Tax)</label>
                           <div className={`erp-switch ${selectedProduct.isPackagedGood ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isPackagedGood: !selectedProduct.isPackagedGood})}>
                              <div className="switch-knob"></div>
                           </div>
                       </div>
                    </div>
                  ) : (
                    <div className="erp-section" style={{ marginTop: '16px' }}>
                       <div className="section-title"><FaBoxOpen /> Procurement Standards</div>
                       <div className="input-group"><label>Standard Purchase Cost</label><input type="number" value={selectedProduct.costPrice || 0} onChange={e => setSelectedProduct({...selectedProduct, costPrice: parseFloat(e.target.value)})} /></div>
                    </div>
                  )}
 
                  <div className="erp-section" style={{ marginTop: '16px' }}>
                     <div className="section-title"><FaClock /> Shared Tax Config</div>
                     <div className="input-row">
                        <div className="input-group"><label>Tax Rate (%)</label><input type="number" value={selectedProduct.taxRate || 0} onChange={e => setSelectedProduct({...selectedProduct, taxRate: parseFloat(e.target.value)})} /></div>
                        <div className="input-group"><label>HSN / Tax Code</label><input value={selectedProduct.taxCode || ''} onChange={e => setSelectedProduct({...selectedProduct, taxCode: e.target.value})} placeholder="e.g. 2106" /></div>
                     </div>
                  </div>
 
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
                </>)}

               {formTab === 'variants' && (<>
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
                     </div> {/* Closing the mapping-selector */}

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
                                   // Also clear related pricings
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
                            
                             {/* Option Price Overrides */}
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
                </>)}

               {formTab === 'upsells' && (<>
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
               </>)}
            </div>
          </CafeQRPopup>
        )}

        {selectedCategory && (
          <CafeQRPopup
            title={selectedCategory.id ? 'Edit Category' : 'New Category'}
            onClose={() => setSelectedCategory(null)}
            onSave={handleSaveCategory}
            isSaving={saving}
            icon={FaLayerGroup}
          >
            <div className="drawer-form">
               <div className="input-group"><label>Name</label><input value={selectedCategory.name} onChange={e => setSelectedCategory({...selectedCategory, name: e.target.value})} /></div>
               <div className="input-group"><label>Description</label><textarea value={selectedCategory.description || ''} onChange={e => setSelectedCategory({...selectedCategory, description: e.target.value})} /></div>
                <div className="control-row">
                   <label>Active Status</label>
                   <div className={`erp-switch ${selectedCategory.isActive ? 'active' : ''}`} onClick={() => setSelectedCategory({...selectedCategory, isActive: !selectedCategory.isActive})}>
                      <div className="switch-knob"></div>
                </div>
                 </div>
              </div>
          </CafeQRPopup>
        )}

        {selectedUom && (
          <CafeQRPopup
            title={selectedUom.id ? 'Edit Unit' : 'New Unit'}
            onClose={() => setSelectedUom(null)}
            onSave={handleSaveUom}
            isSaving={saving}
            icon={FaWeightHanging}
          >
            <div className="drawer-form">
               <div className="input-group"><label>Unit Name</label><input value={selectedUom.name} onChange={e => setSelectedUom({...selectedUom, name: e.target.value})} /></div>
               <div className="input-group"><label>Short Name (Symbol)</label><input value={selectedUom.shortName} onChange={e => setSelectedUom({...selectedUom, shortName: e.target.value})} /></div>
               <div className="input-group"><label>Precision (Decimal Places)</label><input type="number" value={selectedUom.uomPrecision || 0} onChange={e => setSelectedUom({...selectedUom, uomPrecision: e.target.value})} /></div>
               
                <div className="control-row">
                   <label>Is Default Unit</label>
                   <div className={`erp-switch ${selectedUom.isDefault ? 'active' : ''}`} onClick={() => setSelectedUom({...selectedUom, isDefault: !selectedUom.isDefault})}>
                      <div className="switch-knob"></div>
                </div>
                 </div>

                <div className="control-row">
                   <label>Active Status</label>
                   <div className={`erp-switch ${selectedUom.isActive ? 'active' : ''}`} onClick={() => setSelectedUom({...selectedUom, isActive: !selectedUom.isActive})}>
                      <div className="switch-knob"></div>
                </div>
                 </div>
              </div>
          </CafeQRPopup>
        )}

        {selectedVariantGroup && (
          <CafeQRPopup
            title={selectedVariantGroup.id ? 'Edit Variant Group' : 'New Variant Group'}
            onClose={() => setSelectedVariantGroup(null)}
            onSave={handleSaveVariantGroup}
            isSaving={saving}
            icon={FaSlidersH}
          >
            <div className="drawer-form">
               <div className="input-group"><label>Group Name (e.g. Size, Color)</label><input value={selectedVariantGroup.name} onChange={e => setSelectedVariantGroup({...selectedVariantGroup, name: e.target.value})} /></div>
               
                <div className="control-row">
                   <label>Active Status</label>
                   <div className={`erp-switch ${selectedVariantGroup.isActive ? 'active' : ''}`} onClick={() => setSelectedVariantGroup({...selectedVariantGroup, isActive: !selectedVariantGroup.isActive})}>
                      <div className="switch-knob"></div>
                </div>
                 </div>

                 <div className="erp-section" style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                    <div className="section-title"><FaSlidersH /> Variant Options</div>
                    <div className="variant-options-list" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                       {(selectedVariantGroup.options || []).map((opt, idx) => (
                         <div key={idx} className="option-item" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px' }}>
                            <input 
                              placeholder="Option Name (e.g. Small)"
                              value={opt.name || ''} 
                              onChange={e => {
                                 const newOpts = [...(selectedVariantGroup.options || [])];
                                 newOpts[idx].name = e.target.value;
                                 setSelectedVariantGroup({...selectedVariantGroup, options: newOpts});
                              }}
                              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0', color: '#000000' }}
                            />
                            <div className="option-price-input" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'white', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                               <span style={{ fontSize: '12px', fontWeight: 600, color: '#000000' }}>+</span>
                               <input 
                                 type="number" 
                                 placeholder="0"
                                 value={opt.additionalPrice || ''} 
                                 onChange={e => {
                                    const newOpts = [...(selectedVariantGroup.options || [])];
                                    newOpts[idx].additionalPrice = parseFloat(e.target.value) || 0;
                                    setSelectedVariantGroup({...selectedVariantGroup, options: newOpts});
                                 }}
                                 style={{ width: '60px', border: 'none', outline: 'none', fontSize: '13px', color: '#000000' }}
                               />
                            </div>
                            <button className="text-red" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => {
                               const newOpts = (selectedVariantGroup.options || []).filter((_, i) => i !== idx);
                               setSelectedVariantGroup({...selectedVariantGroup, options: newOpts});
                            }}><FaTimes /></button>
                         </div>
                       ))}
                    {(!selectedVariantGroup.options || selectedVariantGroup.options.length === 0) && (
                       <div style={{ textAlign: 'center', color: '#64748b', padding: '24px 16px', fontSize: '13px', background: '#f8fafc', borderRadius: '8px', margin: '8px 0', border: '1px dashed #cbd5e1' }}>
                          <FaSlidersH style={{ marginBottom: '8px', color: '#94a3b8', fontSize: '18px' }} /><br />
                          No options added yet.<br />Click <strong>+ Add Option</strong> below to create choices like Small, Medium, etc.
                       </div>
                    )}
                       <div className="add-option-row" style={{ marginTop: '12px' }}>
                          <button className="erp-btn primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', background: '#f97316', color: 'white', fontWeight: 600, borderRadius: '8px', border: 'none', display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }} onClick={() => setSelectedVariantGroup({
                             ...selectedVariantGroup,
                             options: [...(selectedVariantGroup.options || []), { name: '', additionalPrice: 0, isActive: true }]
                          })}>
                             <FaPlus /> Add Option
                          </button>
                       </div>
                 </div>
              </div>
               </div>
          </CafeQRPopup>
        )}
      </div>

      <style jsx>{`
        .erp-container { padding: 24px 40px; background: #f8fafc; min-height: calc(100vh - 80px); }
        .erp-main-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .erp-header { padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; background: #fff; }
        .erp-tabs { display: flex; gap: 8px; background: #f1f5f9; padding: 4px; border-radius: 10px; }
        .erp-tab { padding: 6px 14px; border: none; background: none; font-weight: 600; color: #64748b; cursor: pointer; border-radius: 8px; font-size: 13px; transition: all 0.2s; }
        .erp-tab.active { background: white; color: #FF7A00; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .erp-tab:hover:not(.active) { color: #0f172a; }

        .erp-filter-bar { padding: 12px 24px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #f1f5f9; background: #fff; }
        .erp-search-field { flex: 1; max-width: 320px; position: relative; display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 0 14px; border: 1.5px solid #f97316; height: 40px; transition: 0.3s; }
        .erp-search-field:focus-within { border-color: #ea580c; background: #fff7ed; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        .erp-search-field svg { color: #94a3b8; font-size: 14px; margin-right: 10px; }
        .erp-search-field input { border: none; background: transparent; font-size: 13px; font-weight: 500; color: #0f172a; width: 100%; outline: none; height: 100%; }
        .erp-search-field input::placeholder { color: #94a3b8; }
        
        .erp-filters { display: flex; align-items: center; gap: 12px; }

        .erp-table-wrapper { overflow-x: auto; }
        .erp-table { width: 100%; border-collapse: collapse; }
        .erp-table th { text-align: left; padding: 14px 16px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #FF7A00; background: #fff; }
        .erp-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; }
        .clickable-row { cursor: pointer; }
        .clickable-row:hover { background: #fcfdfe; }
        .name-text { font-weight: 600; color: #0f172a; display: block; }
        .variant-badge { display: inline-flex; align-items: center; width: fit-content; margin-top: 4px; padding: 3px 8px; border-radius: 999px; background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; }
        .variant-badge.mobile { margin-top: 4px; font-size: 9px; padding: 2px 7px; }
        
        .table-img { width: 40px; height: 40px; border-radius: 8px; background-size: cover; background-position: center; border: 1px solid #e2e8f0; }
        .code-cell { font-family: 'Inter', monospace; color: #64748b; font-weight: 500; font-size: 12px; }
        .type-badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
        .type-badge.veg { background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; }
        .type-badge.non-veg { background: #fef2f2; color: #991b1b; border: 1px solid #fee2e2; }
        .type-badge.egg { background: #fffbeb; color: #b45309; border: 1px solid #fef3c7; }
        
        .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }
        .status-pill.active { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
        .status-pill.inactive { background: #fef2f2; color: #ef4444; border-color: #fee2e2; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill.active .status-dot { background: #22c55e; }
        .status-pill.inactive .status-dot { background: #ef4444; }

        .table-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; }
        .table-btn:hover { background: #f8fafc; color: #0f172a; }

        .drawer-form { display: flex; flex-direction: column; gap: 20px; }
        .erp-section { background: #fcfdfe; padding: 16px; border-radius: 12px; border: 1px solid #f1f5f9; }
        .section-title { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 16px; text-transform: uppercase; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
        
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }
        .input-group input, .input-group textarea { padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; color: #0f172a; }
        .input-group input:focus { border-color: #3b82f6; outline: none; }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .drawer-image-box { display: flex; flex-direction: column; gap: 12px; }
        .drawer-img-preview { width: 100%; height: 180px; border-radius: 12px; background-size: cover; background-position: center; border: 1px solid #e2e8f0; position: relative; }
        .drawer-img-placeholder { width: 100%; height: 140px; background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; gap: 6px; font-size: 13px; }
        .img-clear { position: absolute; top: 8px; right: 8px; background: white; border: none; width: 24px; height: 24px; border-radius: 50%; color: #ef4444; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .control-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #fcfdfe; border: 1px solid #f1f5f9; border-radius: 10px; margin-top: 10px; }
        .control-row label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0; }
        .erp-switch { width: 44px; height: 24px; background: #cbd5e1; border-radius: 100px; position: relative; cursor: pointer; transition: all 0.3s; }
        .erp-switch.active { background: #FF7A00; }
        .switch-knob { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .erp-switch.active .switch-knob { left: calc(100% - 21px); }

        .erp-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .erp-btn.primary { background: #FF7A00; color: white; box-shadow: 0 2px 4px rgba(255, 122, 0, 0.2); }
        .erp-btn.primary:hover { background: #ea580c; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(255, 122, 0, 0.25); }
        .erp-btn.secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
        .erp-actions { display: flex; align-items: center; gap: 12px; }
        .text-slate { color: #64748b; }
        .text-green { color: #22c55e; }
        .ai-tag { background: white; color: #FF7A00; font-size: 8px; font-weight: 900; padding: 1px 4px; border-radius: 4px; margin-left: 4px; vertical-align: middle; text-transform: uppercase; line-height: 1; }
        .variant-options-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
        .option-item { display: flex; align-items: center; gap: 12px; background: white; padding: 8px; border-radius: 10px; border: 1px solid #f1f5f9; }
        .option-item input { flex: 1; border: 1px solid transparent; background: #f8fafc; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; }
        .option-item input:focus { border-color: #3b82f6; background: white; }
        .option-price-input { display: flex; align-items: center; gap: 4px; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; color: #475569; }
        .option-price-input input { width: 50px; border: none; background: transparent; padding: 2px; text-align: right; }
        .icon-btn { width: 28px; height: 28px; border: none; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 6px; }
        .icon-btn.delete { color: #94a3b8; }
        .icon-btn.delete:hover { background: #fef2f2; color: #ef4444; }
        .add-option-row { margin-top: 10px; display: flex; justify-content: flex-end; }
        .erp-btn.sm { padding: 6px 12px; font-size: 11px; }

        .text-green { color: #166534; }

        .text-green { color: #166534; }
        .text-red { color: #991b1b; }
        .hint-text { font-size: 11px; color: #64748b; margin-top: 6px; font-style: italic; }
        .loading-state { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #0f172a; font-size: 18px; background: #f8fafc; }

        .mobile-only { display: none; }
        @media (max-width: 768px) {
           .erp-container { padding: 12px; }
           .desk-only { display: none; }
           .mobile-only { display: block; }
           .erp-header { padding: 16px; flex-direction: column; gap: 16px; align-items: stretch; }
            .erp-actions { flex-direction: row; flex-wrap: nowrap; gap: 8px; justify-content: space-between; }
            .erp-actions button { flex: 1; padding: 12px !important; min-width: 0; display: flex; align-items: center; justify-content: center; }
            .btn-label { display: none; }
            .ai-tag { margin-left: 2px; position: absolute; top: 4px; right: 4px; font-size: 7px; padding: 1px 2px; }
            .erp-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; scrollbar-width: none; -ms-overflow-style: none; }
            .erp-tabs::-webkit-scrollbar { display: none; }
            .erp-tabs button { flex-shrink: 0; }
           .erp-filter-bar { padding: 12px 16px; flex-direction: column; align-items: stretch; }
           .erp-search-field { max-width: none; }
           
           .erp-mobile-list { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
           .mobile-card { background: white; border: 1px solid #f1f5f9; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
           .card-img { width: 48px; height: 48px; border-radius: 8px; background-size: cover; background-position: center; border: 1px solid #f1f5f9; flex-shrink: 0; }
           .card-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
           .card-name { font-size: 14px; font-weight: 600; color: #0f172a; }
           .card-sub { font-size: 12px; color: #64748b; font-weight: 500; }
           .card-action { color: #94a3b8; font-size: 12px; }
           
           .bulk-toolbar { left: 12px; right: 12px; bottom: 12px; padding: 10px; border-radius: 12px; flex-wrap: wrap; justify-content: center; }
           .toolbar-btn { padding: 6px 10px; font-size: 11px; }

           .input-row, .info-options-row { grid-template-columns: 1fr !important; gap: 12px !important; }
           .drawer-tabs { width: 100%; overflow-x: auto; padding: 4px; gap: 4px; }
           .drawer-tab { padding: 6px 12px; font-size: 10px; flex-shrink: 0; }
           .erp-section { padding: 16px; border-radius: 12px; }
           .drawer-img-preview { height: 140px; }
        }

        .bulk-toolbar { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: #0f172a; color: white; padding: 10px 24px; border-radius: 100px; display: flex; align-items: center; gap: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); z-index: 1100; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.1); }
        @keyframes slideUp { from { transform: translate(-50%, 150%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .bulk-toolbar span { font-size: 13px; font-weight: 700; border-right: 1px solid rgba(255,255,255,0.2); padding-right: 20px; color: #FF7A00; }
        .toolbar-btn { background: transparent; border: none; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .toolbar-btn:hover { background: rgba(255,255,255,0.15); color: #FF7A00; }
        .toolbar-btn.delete { color: #fca5a5; }
        .toolbar-btn.delete:hover { background: rgba(239,68,68,0.2); color: #ef4444; }

        .row-selected { background: #fff7ed !important; }
        .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
        .table-btn { color: #64748b; background: transparent; }
        .table-btn:hover { color: #FF7A00; background: #fff7ed; }
        .table-btn.delete:hover { background: #fef2f2; color: #ef4444; }

        .drawer-tabs { display: flex; gap: 4px; padding: 4px; background: #f1f5f9; border-radius: 12px; margin-bottom: 24px; position: sticky; top: -20px; z-index: 10; align-self: flex-start; }
        .drawer-tab { padding: 8px 16px; border: none; background: none; font-size: 11px; font-weight: 700; color: #64748b; cursor: pointer; border-radius: 8px; text-transform: uppercase; transition: all 0.2s; }
        .drawer-tab.active { background: white; color: #FF7A00; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .drawer-tab:hover:not(.active) { color: #0f172a; }

        .mapping-selector { display: flex; flex-direction: column; gap: 8px; }
        .erp-select { padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; color: #0f172a; width: 100%; }

        .mappings-list { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
        .mapping-item-card { background: white; border: 1px solid #f1f5f9; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
        .variant-mapping-card { border-color: #e2e8f0; box-shadow: 0 8px 18px rgba(15,23,42,0.04); }
        .mapping-item-card.horizontal { flex-direction: row; align-items: center; }
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

        .section-desc { font-size: 12px; color: #94a3b8; margin-top: -12px; margin-bottom: 20px; }
        .text-red { color: #ef4444; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }

        .view-mode input, .view-mode textarea { pointer-events: none; background: #f8fafc !important; border-color: transparent !important; }
        .view-mode .variant-option-name, .view-mode .variant-group-heading strong { color: #0f172a !important; opacity: 1; }
        .view-mode .variant-option-base, .view-mode .variant-enabled-label, .view-mode .variant-currency { opacity: 1; }
        .view-mode .variant-price-input { color: #0f172a !important; border-color: #e2e8f0 !important; }
        .view-mode .NiceSelect { pointer-events: none; opacity: 0.8; }
        .card-check { display: flex; align-items: center; justify-content: center; }
        .card-check input { width: 18px; height: 18px; }
        @media (max-width: 640px) {
          .variant-option-row { grid-template-columns: 1fr; align-items: stretch; }
          .variant-option-controls { grid-template-columns: 1fr auto 82px; }
          .variant-price-input { width: 82px; }
        }
      `}</style>
      <style jsx global>{`
        /* Branded orange borders for all Interactive Selects */
        .erp-container :global(.nice-select) {
            border: 1.5px solid #f97316 !important;
            border-radius: 12px !important;
            transition: 0.3s !important;
            background: #fff !important;
            height: 40px !important;
            line-height: 40px !important;
        }
        .erp-container :global(.nice-select:hover) {
            background: #fff7ed !important;
            border-color: #ea580c !important;
        }
        .erp-container :global(.nice-select .current) {
            font-weight: 600 !important;
            font-size: 13px !important;
            color: #0f172a !important;
        }
      `}</style>
        {/* Modals for Import */}
        {showImageImport && (
          <MenuImageImport 
            onClose={() => setShowImageImport(false)} 
            existingItems={products}
            onImported={async (newItems) => {
              notify('success', `Successfully imported ${newItems?.length || 0} items!`);
              await Promise.allSettled([
                fetchCategories(),
                fetchVariantGroups(),
                fetchProducts()
              ]);
            }} 
          />
        )}
        {showExcelImport && (
          <MenuExcelImport 
            onClose={() => setShowExcelImport(false)} 
            onImported={async (newItems) => {
              notify('success', `Successfully imported ${newItems?.length || 0} items!`);
              await Promise.allSettled([
                fetchCategories(),
                fetchProducts()
              ]);
            }} 
          />
        )}
      </DashboardLayout>
  );
}
