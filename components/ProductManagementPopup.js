import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import NiceSelect from './NiceSelect';
import CafeQRPopup from './CafeQRPopup';
import api from '../utils/api';
import { printBarcodeLabel } from '../utils/barcodeLabelPrint';
import { 
  FaBoxOpen, FaUtensils, FaCheckCircle, 
  FaTimes, FaCamera, FaLayerGroup, FaClock,
  FaWeightHanging, FaBarcode, FaUtensilSpoon, FaCogs, FaSlidersH,
  FaPlus, FaMinus, FaSearch, FaChevronRight, FaTags, FaMoneyBillWave, FaPrint,
  FaSpinner, FaAlignLeft, FaTrashAlt
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
  config = null,
}) {
  const { notify } = useNotification();
  const [viewOnly, setViewOnly] = useState(initialViewOnly);
  const [saving, setSaving] = useState(false);
  const [formTab, setFormTab] = useState('basic'); // 'basic', 'inventory', 'pricing', 'variants', 'upsells'
  const [pricingView, setPricingView] = useState('sales'); // 'sales', 'purchase'
  const [recipeSearch, setRecipeSearch] = useState('');
  const [serverIngredientResults, setServerIngredientResults] = useState([]);
  const [isSearchingRecipe, setIsSearchingRecipe] = useState(false);
  const [showRecipeDropdown, setShowRecipeDropdown] = useState(false);
  const recipeDropdownRef = useRef(null);
  const [recipeVariantTab, setRecipeVariantTab] = useState('all'); // 'all' = base/common ingredients, or variantOptionId
  const [inventoryEnabled, setInventoryEnabled] = useState(true);
  const [purchasingEnabled, setPurchasingEnabled] = useState(true);
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [barcodeEnabled, setBarcodeEnabled] = useState(() => config?.barcodeScannerEnabled === true);
  const [labelCopies, setLabelCopies] = useState(1);
  const [printingLabel, setPrintingLabel] = useState(false);

  const handlePrintLabel = async () => {
    if (!selectedProduct?.barcode) {
      notify('error', 'Please enter a barcode before printing a label.');
      return;
    }
    setPrintingLabel(true);
    try {
      await printBarcodeLabel({
        name: selectedProduct.name || 'Product',
        barcode: selectedProduct.barcode,
        price: selectedProduct.price,
        mrp: selectedProduct.mrp,
        sym: config?.currencySymbol || '₹',
        quantity: labelCopies
      });
      notify('success', `Sent ${labelCopies} barcode label(s) to printer!`);
    } catch (err) {
      notify('error', 'Failed to print barcode label: ' + err.message);
    } finally {
      setPrintingLabel(false);
    }
  };

  const handleAutoGenerateBarcode = () => {
    const prefix = '890';
    let body = '';
    for (let i = 0; i < 9; i++) {
      body += Math.floor(Math.random() * 10);
    }
    const full12 = prefix + body;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(full12[i], 10);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checksum = (10 - (sum % 10)) % 10;
    const validEan13 = full12 + checksum;

    setSelectedProduct(prev => ({ ...prev, barcode: validEan13 }));
    notify('success', `Generated GS1 EAN-13 barcode: ${validEan13}`);
  };

  // Dropdown options data state
  const [categories, setCategories] = useState(propCategories || []);
  const [uoms, setUoms] = useState(propUoms || []);
  const [variantGroups, setVariantGroups] = useState(propVariantGroups || []);
  const [pricelists, setPricelists] = useState(propPricelists || []);
  const [products, setProducts] = useState(propProducts || []);

  // Sync props into local state when parent finishes loading or updates
  useEffect(() => {
    if (propCategories && propCategories.length > 0) setCategories(propCategories);
  }, [propCategories]);

  useEffect(() => {
    if (propUoms && propUoms.length > 0) setUoms(propUoms);
  }, [propUoms]);

  useEffect(() => {
    if (propVariantGroups && propVariantGroups.length > 0) {
      setVariantGroups(prev => {
        const map = new Map(prev.map(g => [String(g.id), g]));
        propVariantGroups.forEach(g => {
          const existing = map.get(String(g.id));
          if (!existing || (!existing.options?.length && g.options?.length)) {
            map.set(String(g.id), g);
          } else {
            map.set(String(g.id), { ...existing, ...g, options: g.options?.length ? g.options : (existing.options || []) });
          }
        });
        return Array.from(map.values());
      });
    }
  }, [propVariantGroups]);

  useEffect(() => {
    if (propPricelists && propPricelists.length > 0) setPricelists(propPricelists);
  }, [propPricelists]);

  useEffect(() => {
    if (propProducts && propProducts.length > 0) setProducts(propProducts);
  }, [propProducts]);

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
          const resp = await api.get('/api/v1/purchasing/pricelists').catch(() => ({ data: { data: [] } }));
          if (active && resp.data.success) setPricelists(resp.data.data || []);
        }
        if (!propProducts || propProducts.length === 0) {
          const resp = await api.get('/api/v1/products');
          if (active && resp.data.success) {
            const items = Array.isArray(resp.data.data) ? resp.data.data : (resp.data.data?.content || []);
            setProducts(items);
          }
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
    if (config?.barcodeScannerEnabled !== undefined) {
      setBarcodeEnabled(config.barcodeScannerEnabled === true);
    }
    (async () => {
      try {
        const resp = await api.get('/api/v1/configurations');
        if (active && resp.data?.success) {
          setInventoryEnabled(resp.data.data.inventoryEnabled !== false);
          setPurchasingEnabled(resp.data.data.purchaseEnabled !== false && resp.data.data.purchasingEnabled !== false);
          setTaxEnabled(resp.data.data.taxEnabled !== false);
          setBarcodeEnabled(resp.data.data.barcodeScannerEnabled === true);
          if (resp.data.data.purchaseEnabled === false || resp.data.data.purchasingEnabled === false) {
            setPricingView('sales');
          }
        }
      } catch (err) {
        console.warn("Failed to load configuration in ProductManagementPopup:", err);
      }
    })();
    return () => { active = false; };
  }, [config]);

  // Live debounced server search for ingredients across all categories/pages
  useEffect(() => {
    if (!recipeSearch || !recipeSearch.trim()) {
      setServerIngredientResults([]);
      setIsSearchingRecipe(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingRecipe(true);
        const resp = await api.get('/api/v1/products', {
          params: {
            page: 0,
            size: 50,
            search: recipeSearch.trim(),
            status: 'ACTIVE'
          }
        });
        if (resp.data?.success) {
          const results = resp.data.data?.content || (Array.isArray(resp.data.data) ? resp.data.data : []);
          setServerIngredientResults(results);
          // Merge discovered products into popup state so full metadata is preserved
          setProducts(prev => {
            const existingIds = new Set((prev || []).map(p => p.id));
            const newItems = results.filter(r => r && r.id && !existingIds.has(r.id));
            return newItems.length > 0 ? [...(prev || []), ...newItems] : prev;
          });
        }
      } catch (err) {
        console.warn("Failed to search recipe ingredients:", err);
      } finally {
        setIsSearchingRecipe(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [recipeSearch]);

  // Click outside to close recipe ingredient dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (recipeDropdownRef.current && !recipeDropdownRef.current.contains(event.target)) {
        setShowRecipeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

    return categories.find(c => String(c.id) === String(productCategoryId))
      || categories.find(c => productCategoryName && c.name?.toLowerCase() === productCategoryName.toLowerCase())
      || (p.category ? p.category : null)
      || (productCategoryId || productCategoryName ? { id: productCategoryId || null, name: productCategoryName || 'Selected Category' } : null)
      || categories[0];
  };

  const findUomForProduct = (p) => {
    const productUomId = p.uom?.id || p.uomId;
    const productUomName = p.uom?.name || p.uomName;
    const productUomShortName = p.uom?.shortName || p.uomShortName;

    return uoms.find(u => String(u.id) === String(productUomId))
      || uoms.find(u => productUomName && (u.name?.toLowerCase() === productUomName.toLowerCase() || u.shortName?.toLowerCase() === productUomName.toLowerCase()))
      || (p.uom ? p.uom : null)
      || (productUomId || productUomName ? { id: productUomId || null, name: productUomName || 'Selected Unit', shortName: productUomShortName } : null)
      || uoms[0];
  };

  const normalizeVariantGroup = (group) => {
    if (!group) return null;
    const cachedGroup = variantGroups.find(g => String(g.id) === String(group.id));
    const options = (Array.isArray(group.options) && group.options.length > 0)
      ? group.options
      : (Array.isArray(cachedGroup?.options) && cachedGroup.options.length > 0 ? cachedGroup.options : (group.options || []));
    return {
      ...(cachedGroup || {}),
      ...group,
      options
    };
  };

  const normalizeProductForDrawer = (rawProduct = {}) => {
    const isEvent = Boolean(rawProduct && (rawProduct.nativeEvent || rawProduct.target || typeof rawProduct.stopPropagation === 'function' || rawProduct._reactName));
    const p = (!isEvent && rawProduct && typeof rawProduct === 'object') ? rawProduct : {};

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
              id: mapping.id || null,
              variantGroup,
              isRequired: toBoolean(mapping.isRequired, true)
            };
          })
          .filter(Boolean)
      : [];

    const variantPricings = Array.isArray(p.variantPricings)
      ? p.variantPricings.map(pricing => {
          const variantOption = pricing.variantOption
            || pricing.option
            || (pricing.variantOptionId ? { id: pricing.variantOptionId, name: 'Variant Option' } : null);
          return {
            id: pricing.id || null,
            variantOption: variantOption ? {
              id: variantOption.id,
              name: variantOption.name,
              additionalPrice: toNumber(variantOption.additionalPrice, 0)
            } : null,
            variantOptionId: variantOption?.id || null,
            additionalPrice: toNumber(pricing.additionalPrice ?? variantOption?.additionalPrice, 0),
            price: pricing.price !== undefined && pricing.price !== null ? toNumber(pricing.price, 0) : null,
            overridePrice: pricing.overridePrice !== undefined && pricing.overridePrice !== null ? toNumber(pricing.overridePrice) : (pricing.price !== undefined && pricing.price !== null ? toNumber(pricing.price) : null),
            costPrice: pricing.costPrice !== undefined && pricing.costPrice !== null ? toNumber(pricing.costPrice) : null,
            isAvailable: pricing.isAvailable !== false,
            isActive: pricing.isActive ?? pricing.isactive ?? 'Y'
          };
        })
      : [];

    const upsells = Array.isArray(p.upsells)
      ? p.upsells
          .map(upsell => {
            const upsellProduct = upsell.upsellProduct
              || upsell.product
              || (upsell.upsellProductId ? { id: upsell.upsellProductId, name: 'Upsell Product' } : null);
            if (!upsellProduct) return null;
            return {
              id: upsell.id || null,
              upsellProduct,
              isActive: upsell.isActive ?? upsell.isactive ?? 'Y'
            };
          })
          .filter(Boolean)
      : [];

    const pricelistProducts = Array.isArray(p.pricelistProducts)
      ? p.pricelistProducts.map(item => ({
          id: item.id || null,
          pricelistId: item.pricelistId || item.pricelist?.id,
          price: toNumber(item.price, 0),
          isActive: item.isActive ?? item.isactive ?? 'Y'
        }))
      : [];

    const recipeLines = Array.isArray(p.recipeLines)
      ? p.recipeLines
          .map(line => {
             const ingredient = line.ingredient
               || (line.ingredientId ? {
                    id: line.ingredientId,
                    name: line.ingredientName || 'Ingredient Product',
                    productCode: line.ingredientProductCode || '',
                    uomName: line.uomName || '',
                    uomShortName: line.uomName || '',
                    isIngredient: true
                  } : null);
             if (!ingredient) return null;

             const variantOption = line.variantOption
               || (line.variantOptionId ? { id: line.variantOptionId, name: line.variantOptionName || 'Variant' } : null);

             return {
               id: line.id || null,
               ingredient,
               ingredientId: ingredient.id,
               ingredientName: ingredient.name,
               variantOption,
               variantOptionId: variantOption?.id || null,
               variantOptionName: variantOption?.name || line.variantOptionName || null,
               uomName: line.uomName || ingredient.uomName || ingredient.uom?.name || '',
               quantity: toNumber(line.quantity, 1),
               isActive: line.isActive ?? line.isactive ?? true
             };
          })
          .filter(Boolean)
      : [];

    const hasVariants = variantMappings.length > 0 || variantPricings.length > 0 || Boolean(p.hasVariants);

    return {
      ...(p.id ? { id: p.id } : {}),
      name: p.name || '',
      description: p.description || '',
      price: toNumber(p.price ?? p.salePrice, 0),
      isAvailable: toBoolean(p.isAvailable ?? p.available, true),
      isDeliveryVisible: toBoolean(p.isDeliveryVisible ?? true, true),
      imageUrl: p.imageUrl || '',
      productType: p.productType || 'VEG',
      isVariant: toBoolean(p.isVariant || hasVariants, false),
      isPackagedGood: toBoolean(p.isPackagedGood, false),
      isIngredient: toBoolean(p.isIngredient, false),
      isVariablePrice: toBoolean(p.isVariablePrice, false),
      productCode: p.productCode || '',
      taxRate: toNumber(p.taxRate, 0),
      taxCode: p.taxCode || '',
      mrp: toNumber(p.mrp, 0),
      costPrice: toNumber(p.costPrice, 0),
      defaultPricelistId: p.defaultPricelistId || p.defaultPricelist?.id || '',
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
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Sync prop changes from parent immediately
  useEffect(() => {
    if (!initialProduct) return;
    setSelectedProduct(prev => {
      // If we don't have a product yet, or ID changed, or parent passed loaded sub-entities
      const hasSubEntities = (initialProduct.variantMappings && initialProduct.variantMappings.length > 0) ||
        (initialProduct.recipeLines && initialProduct.recipeLines.length > 0) ||
        (initialProduct.variantPricings && initialProduct.variantPricings.length > 0);
      if (!prev?.id || prev.id !== initialProduct.id || hasSubEntities) {
        return normalizeProductForDrawer(initialProduct);
      }
      return prev;
    });
  }, [initialProduct]);

  // Automatically fetch full product details (including variantMappings, pricings, recipes) from API
  useEffect(() => {
    if (!initialProduct?.id) return;

    let isMounted = true;
    setLoadingDetails(true);

    api.get(`/api/v1/products/${initialProduct.id}`)
      .then(resp => {
        if (isMounted && resp.data?.success && resp.data?.data) {
          const detail = resp.data.data;

          // Ensure any variant groups associated with this product are present in variantGroups state with options
          if (Array.isArray(detail.variantMappings)) {
            setVariantGroups(prev => {
              const map = new Map(prev.map(g => [String(g.id), g]));
              detail.variantMappings.forEach(m => {
                if (m.variantGroup?.id) {
                  const existing = map.get(String(m.variantGroup.id));
                  if (!existing || (!existing.options?.length && m.variantGroup.options?.length)) {
                    map.set(String(m.variantGroup.id), m.variantGroup);
                  }
                }
              });
              return Array.from(map.values());
            });
          }

          setSelectedProduct(normalizeProductForDrawer(detail));
        }
      })
      .catch(err => {
        console.error('Failed to load complete product details in popup:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingDetails(false);
      });

    return () => { isMounted = false; };
  }, [initialProduct?.id]);

  // Compute ingredient suggestions combining loaded catalog and live server search results
  // STRICT REQUIREMENT: Only products marked as ingredients are loaded/suggested in inventory recipes
  const ingredientSuggestions = useMemo(() => {
    const map = new Map();
    (products || []).forEach(p => { if (p && p.id) map.set(String(p.id), p); });
    (serverIngredientResults || []).forEach(p => { if (p && p.id) map.set(String(p.id), p); });
    const allCandidates = Array.from(map.values());

    const activeVoId = (selectedProduct?.isVariant && recipeVariantTab !== 'all') ? String(recipeVariantTab) : null;
    const existingRecipeIngredientIds = new Set(
      (selectedProduct?.recipeLines || [])
        .filter(r => {
          if (!selectedProduct?.isVariant) return true;
          const lineVoId = r.variantOption?.id || r.variantOptionId || null;
          if (!activeVoId) return !lineVoId;
          return String(lineVoId) === activeVoId;
        })
        .map(r => String(r.ingredient?.id || r.ingredientId))
        .filter(Boolean)
    );

    return allCandidates.filter(p => {
      if (!p || !p.id) return false;
      if (String(p.id) === String(selectedProduct?.id)) return false;
      if (existingRecipeIngredientIds.has(String(p.id))) return false;

      // Only items designated as raw ingredients can compose a product recipe
      const isIng = p.isIngredient === true ||
        p.is_ingredient === true ||
        String(p.isIngredient).trim().toUpperCase() === 'Y' ||
        String(p.isIngredient).trim().toUpperCase() === 'TRUE' ||
        String(p.is_ingredient).trim().toUpperCase() === 'Y' ||
        String(p.is_ingredient).trim().toUpperCase() === 'TRUE';
      return isIng;
    }).sort((a, b) => {
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [products, serverIngredientResults, selectedProduct?.recipeLines, selectedProduct?.id, selectedProduct?.isVariant, recipeVariantTab]);

  const ingredientOptions = useMemo(() => {
    return ingredientSuggestions.map(p => {
      const uom = p.uom?.shortName || p.uomName || p.uom?.name || '';
      const code = p.productCode ? ` [#${p.productCode}]` : '';
      const cat = p.category?.name ? ` • ${p.category.name}` : '';
      return {
        value: p.id,
        label: `${p.name}${uom ? ` (${uom})` : ''}${cat}${code}`
      };
    });
  }, [ingredientSuggestions]);

  const normalizeById = (items = [], item) => {
    if (!item?.id) return items;
    return items.some(existing => existing.id === item.id) ? items : [...items, item];
  };

  const handleSaveProduct = async (e) => {
    if (e) e.preventDefault();

    const isIngredient = Boolean(selectedProduct.isIngredient);
    const baseSalePrice = isIngredient ? 0 : Number(selectedProduct.price || 0);
    const baseCostPrice = Number(selectedProduct.costPrice || 0);

    // 1. Mandatory Field Validation
    if (!selectedProduct.name || !selectedProduct.name.trim()) {
      notify('error', 'Product name is required');
      return;
    }

    if (!selectedProduct.category || !selectedProduct.category.id) {
      notify('error', 'Category is required');
      return;
    }

    if (!isIngredient) {
      if (selectedProduct.price === null || selectedProduct.price === undefined || isNaN(selectedProduct.price) || selectedProduct.price === '') {
        notify('error', 'Sale Price is required');
        return;
      }
      if (Number(selectedProduct.price) < 0) {
        notify('error', 'Sale Price cannot be negative');
        return;
      }
    }

    // 2. Duplicate Validation (Name and Code)
    const currentName = selectedProduct.name.trim().toLowerCase();
    const currentCode = selectedProduct.productCode ? selectedProduct.productCode.trim().toLowerCase() : '';

    if (Array.isArray(products)) {
      for (const p of products) {
        if (p.isActive !== false && p.id !== selectedProduct.id) {
          if (p.name && p.name.trim().toLowerCase() === currentName) {
            notify('error', 'Product with this name already exists');
            return;
          }
          if (currentCode && p.productCode && p.productCode.trim().toLowerCase() === currentCode) {
            notify('error', 'Product with this code already exists');
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const isNew = !selectedProduct.id;
      const url = isNew ? '/api/v1/products' : `/api/v1/products/${selectedProduct.id}`;
      const allMappedGroupOptions = (selectedProduct.variantMappings || [])
        .filter(vm => vm.variantGroup?.id)
        .flatMap(vm => {
          const g = vm.variantGroup;
          const cached = variantGroups.find(x => String(x.id) === String(g.id));
          return (Array.isArray(g.options) && g.options.length > 0)
            ? g.options
            : (Array.isArray(cached?.options) && cached.options.length > 0 ? cached.options : (g.options || []));
        });

      const finalVariantPricings = allMappedGroupOptions.map(opt => {
        const existingVP = (selectedProduct.variantPricings || []).find(vp => 
          String(vp.variantOption?.id || vp.variantOptionId || '') === String(opt.id)
        );
        const addPrice = Number(opt.additionalPrice || 0);

        const overridePrice = (existingVP && existingVP.overridePrice !== null && existingVP.overridePrice !== undefined && existingVP.overridePrice !== '' && !isNaN(existingVP.overridePrice))
          ? Number(existingVP.overridePrice)
          : (baseSalePrice + addPrice);

        const costPrice = (existingVP && existingVP.costPrice !== null && existingVP.costPrice !== undefined && existingVP.costPrice !== '' && !isNaN(existingVP.costPrice))
          ? Number(existingVP.costPrice)
          : (baseCostPrice + addPrice);

        const isAvailable = existingVP ? existingVP.isAvailable !== false : true;

        return {
          id: existingVP?.id || null,
          overridePrice: overridePrice,
          costPrice: costPrice,
          isAvailable: isAvailable,
          variantOption: { id: opt.id }
        };
      });

      const hasVariants = (selectedProduct.variantMappings || []).filter(vm => vm.variantGroup?.id).length > 0;

      const payload = {
        ...(selectedProduct.id ? { id: selectedProduct.id } : {}),
        name: (selectedProduct.name || '').trim(),
        description: selectedProduct.description || '',
        imageUrl: selectedProduct.imageUrl || '',
        barcode: selectedProduct.barcode || '',
        productCode: selectedProduct.productCode || '',
        taxCode: selectedProduct.taxCode || '',
        kdsStation: selectedProduct.kdsStation || '',
        productType: selectedProduct.productType || 'VEG',
        isAvailable: selectedProduct.isAvailable !== false,
        isDeliveryVisible: selectedProduct.isDeliveryVisible !== false,
        isActive: selectedProduct.isActive !== false,
        isVariant: hasVariants || Boolean(selectedProduct.isVariant),
        isPackagedGood: Boolean(selectedProduct.isPackagedGood),
        isIngredient: Boolean(selectedProduct.isIngredient),
        isVariablePrice: Boolean(selectedProduct.isVariablePrice),
        price: isIngredient ? 0 : Number(selectedProduct.price || 0),
        costPrice: baseCostPrice,
        mrp: selectedProduct.mrp === '' || selectedProduct.mrp === null || selectedProduct.mrp === undefined || isNaN(selectedProduct.mrp) ? 0 : Number(selectedProduct.mrp),
        taxRate: selectedProduct.taxRate === '' || selectedProduct.taxRate === null || selectedProduct.taxRate === undefined || isNaN(selectedProduct.taxRate) ? 0 : Number(selectedProduct.taxRate),
        minStockLevel: selectedProduct.minStockLevel === '' || selectedProduct.minStockLevel === null || selectedProduct.minStockLevel === undefined || isNaN(selectedProduct.minStockLevel) ? 0 : Number(selectedProduct.minStockLevel),
        category: selectedProduct.category?.id ? { id: selectedProduct.category.id } : null,
        uom: selectedProduct.uom?.id ? { id: selectedProduct.uom.id } : null,
        defaultPricelist: selectedProduct.defaultPricelistId ? { id: selectedProduct.defaultPricelistId } : null,
        pricelistProducts: (selectedProduct.pricelistProducts || [])
          .filter(pp => pp && (pp.pricelistId || pp.pricelist?.id))
          .map(pp => ({
            id: pp.id || null,
            pricelistId: pp.pricelistId || pp.pricelist?.id,
            price: Number(pp.price) || 0,
            isActive: pp.isActive || 'Y'
          })),
        variantMappings: (selectedProduct.variantMappings || [])
          .filter(vm => vm.variantGroup?.id)
          .map(vm => ({ ...vm, variantGroup: { id: vm.variantGroup.id } })),
        variantPricings: finalVariantPricings,
        upsells: (selectedProduct.upsells || [])
          .filter(u => u.upsellProduct?.id || u.upsellProductId)
          .map(u => ({ ...u, upsellProduct: { id: u.upsellProduct?.id || u.upsellProductId } })),
        recipeLines: (selectedProduct.recipeLines || [])
          .filter(r => r && (r.ingredient?.id || r.ingredientId))
          .map(({ id, ingredient, ingredientId, variantOption, variantOptionId, quantity, isActive }) => ({
            id: id || null,
            ingredient: { id: ingredient?.id || ingredientId },
            variantOption: (variantOption?.id || variantOptionId) ? { id: variantOption?.id || variantOptionId } : null,
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
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || "Failed to save product";
      notify('error', errMsg);
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
         <button type="button" className={`drawer-tab ${formTab === 'basic' ? 'active' : ''}`} onClick={() => setFormTab('basic')}>
            <FaBoxOpen />
            <span>General</span>
         </button>
         {inventoryEnabled && (
            <button type="button" className={`drawer-tab ${formTab === 'inventory' ? 'active' : ''}`} onClick={() => setFormTab('inventory')}>
               <FaWeightHanging />
               <span>Inventory</span>
            </button>
         )}
         <button type="button" className={`drawer-tab ${formTab === 'pricing' ? 'active' : ''}`} onClick={() => setFormTab('pricing')}>
            <FaTags />
            <span>Pricing</span>
         </button>
         <button type="button" className={`drawer-tab ${formTab === 'variants' ? 'active' : ''}`} onClick={() => setFormTab('variants')}>
            <FaSlidersH />
            <span>Variants</span>
         </button>
         <button type="button" className={`drawer-tab ${formTab === 'upsells' ? 'active' : ''}`} onClick={() => setFormTab('upsells')}>
            <FaLayerGroup />
            <span>Upsells</span>
         </button>
      </div>

      <div className={`drawer-form ${viewOnly ? 'view-mode' : ''}`}>
         {viewOnly && (
           <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button className="erp-btn secondary sm" onClick={() => setViewOnly(false)}>Edit Info</button>
           </div>
         )}

         {formTab === 'basic' && (
           <>
             {config?.menuImagesEnabled && (
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
              )}

             <div className="erp-section">
                <div className="section-title"><FaBarcode /> Basic Info</div>
                <div className="input-row">
                   <div className="input-group"><label>Name <span style={{ color: '#ef4444' }}>*</span></label><input value={selectedProduct.name} onChange={e => setSelectedProduct({...selectedProduct, name: e.target.value})} placeholder="e.g. Chicken Burger" /></div>
                   <div className="input-group"><label>Item Code</label><input value={selectedProduct.productCode || ''} onChange={e => setSelectedProduct({...selectedProduct, productCode: e.target.value})} placeholder="e.g. CB001" /></div>
                </div>
               
                <div className="input-row" style={{ marginTop: '16px' }}>
                   <div className="input-group">
                      <label>Category <span style={{ color: '#ef4444' }}>*</span></label>
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
                  <div className="input-group" style={{ flex: barcodeEnabled ? undefined : 1 }}>
                     <label>Unit (UOM)</label>
                      <NiceSelect 
                        options={uomOptions.map(u => ({ value: u.id, label: u.name }))}
                        value={selectedProduct.uom?.id || ''}
                        onChange={val => setSelectedProduct({...selectedProduct, uom: uomOptions.find(u => u.id === val)})}
                      />
                  </div>
                  {barcodeEnabled && (
                    <div className="input-group">
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ margin: 0 }}>Barcode</label>
                          {selectedProduct.barcode && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <label style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>Qty:</label>
                              <input 
                                type="number" 
                                min="1" 
                                max="100" 
                                value={labelCopies} 
                                onChange={e => setLabelCopies(Math.max(1, parseInt(e.target.value) || 1))}
                                style={{ width: '42px', padding: '2px 4px', fontSize: '11px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                              />
                              <button
                                type="button"
                                onClick={handlePrintLabel}
                                disabled={printingLabel}
                                style={{
                                  background: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <FaPrint style={{ fontSize: '10px' }} />
                                {printingLabel ? 'Printing...' : 'Print Label'}
                              </button>
                            </div>
                          )}
                       </div>
                       <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                         <input 
                           value={selectedProduct.barcode || ''} 
                           onChange={e => setSelectedProduct({...selectedProduct, barcode: e.target.value})} 
                           placeholder="e.g. 8901491361026" 
                           style={{ flex: 1 }}
                         />
                         <button
                           type="button"
                           onClick={handleAutoGenerateBarcode}
                           title="Auto-generate a valid GS1 EAN-13 barcode with correct checksum"
                           style={{
                             background: '#f59e0b',
                             color: 'white',
                             border: 'none',
                             borderRadius: '6px',
                             padding: '8px 10px',
                             fontSize: '11px',
                             fontWeight: 700,
                             cursor: 'pointer',
                             whiteSpace: 'nowrap'
                           }}
                         >
                           ⚡ Auto
                         </button>
                       </div>
                    </div>
                  )}
               </div>
               <div className="input-group" style={{ marginTop: '14px' }}>
                   <label>Description</label>
                   <textarea 
                     value={selectedProduct.description || ''} 
                     onChange={e => setSelectedProduct({...selectedProduct, description: e.target.value})} 
                     placeholder="Describe product details, ingredients, or preparation notes..." 
                     rows={2} 
                     style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '7px', fontSize: '12px', resize: 'vertical' }} 
                   />
                </div>
              </div>

             <div className="info-options-row" style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                   <label style={{ margin: 0 }}>Packaged Good</label>
                   <div className={`erp-switch ${selectedProduct.isPackagedGood ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isPackagedGood: !selectedProduct.isPackagedGood})}>
                      <div className="switch-knob"></div>
                   </div>
                </div>
                {inventoryEnabled && (
                  <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                     <label style={{ margin: 0 }}>Is Ingredient</label>
                     <div className={`erp-switch ${selectedProduct.isIngredient ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isIngredient: !selectedProduct.isIngredient})}>
                       <div className="switch-knob"></div>
                     </div>
                  </div>
                )}
                <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                   <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Variable Price</label>
                   <div className={`erp-switch ${selectedProduct.isVariablePrice ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isVariablePrice: !selectedProduct.isVariablePrice})}>
                     <div className="switch-knob"></div>
                   </div>
                </div>
                <div className="control-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
                   <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Show in Delivery Website</label>
                   <div className={`erp-switch ${selectedProduct.isDeliveryVisible ? 'active' : ''}`} onClick={() => !viewOnly && setSelectedProduct({...selectedProduct, isDeliveryVisible: !selectedProduct.isDeliveryVisible})}>
                     <div className="switch-knob"></div>
                   </div>
                </div>
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
                   <div className="input-group"><label>Min Stock Level</label><input type="number" placeholder="0" value={selectedProduct.minStockLevel === 0 || selectedProduct.minStockLevel === '' || selectedProduct.minStockLevel === null || selectedProduct.minStockLevel === undefined || isNaN(selectedProduct.minStockLevel) ? '' : selectedProduct.minStockLevel} onChange={e => setSelectedProduct({...selectedProduct, minStockLevel: e.target.value === '' ? '' : parseInt(e.target.value)})} /></div>
                   <div style={{ flex: 1 }}></div>
                </div>
             </div>

             {!selectedProduct.isIngredient && (
                <div className="erp-section" style={{ marginTop: '16px' }}>
                   <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FaCogs /> Recipe / Bill of Materials</span>
                      {(selectedProduct.recipeLines || []).length > 0 && (
                         <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
                            {(selectedProduct.recipeLines || []).length} {(selectedProduct.recipeLines || []).length === 1 ? 'item' : 'items'}
                         </span>
                      )}
                   </div>

                   {/* Variant Recipe Tabs */}
                   {selectedProduct.isVariant && (selectedProduct.variantMappings || []).length > 0 && (() => {
                      const allVariantOptions = (selectedProduct.variantMappings || []).flatMap(vm => {
                         const gOptions = (Array.isArray(vm.variantGroup?.options) && vm.variantGroup.options.length > 0)
                           ? vm.variantGroup.options
                           : (variantGroups.find(g => String(g.id) === String(vm.variantGroup?.id))?.options || []);
                         return gOptions.map(opt => ({
                            id: opt.id,
                            name: opt.name,
                            groupName: vm.variantGroup?.name || 'Variant'
                         }));
                      });
                      return allVariantOptions.length > 0 ? (
                         <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '12px',
                            padding: '4px',
                            background: '#ffffff',
                            borderRadius: '14px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                            overflowX: 'auto',
                            scrollbarWidth: 'none'
                         }}>
                            <button
                               type="button"
                               onClick={() => setRecipeVariantTab('all')}
                               style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '7px 16px',
                                  height: '34px',
                                  borderRadius: '10px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  border: 'none',
                                  background: recipeVariantTab === 'all' ? '#f97316' : 'transparent',
                                  color: recipeVariantTab === 'all' ? 'white' : '#64748b',
                                  boxShadow: recipeVariantTab === 'all' ? '0 4px 12px rgba(249, 115, 22, 0.25)' : 'none',
                                  transition: 'all 0.2s ease',
                                  whiteSpace: 'nowrap'
                               }}
                            >
                               <FaSlidersH style={{ fontSize: '11px', color: recipeVariantTab === 'all' ? 'white' : '#64748b' }} />
                               <span>Base Recipe</span>
                            </button>
                            {allVariantOptions.map(opt => {
                               const count = (selectedProduct.recipeLines || []).filter(r =>
                                  String(r.variantOption?.id || r.variantOptionId || '') === String(opt.id)
                               ).length;
                               const isSelected = String(recipeVariantTab) === String(opt.id);
                               return (
                                  <button
                                     key={opt.id}
                                     type="button"
                                     onClick={() => setRecipeVariantTab(opt.id)}
                                     style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 16px',
                                        height: '34px',
                                        borderRadius: '10px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        border: 'none',
                                        background: isSelected ? '#f97316' : 'transparent',
                                        color: isSelected ? 'white' : '#64748b',
                                        boxShadow: isSelected ? '0 4px 12px rgba(249, 115, 22, 0.25)' : 'none',
                                        textTransform: 'capitalize',
                                        transition: 'all 0.2s ease',
                                        whiteSpace: 'nowrap'
                                     }}
                                  >
                                     <span>{opt.name}</span>
                                     {count > 0 && (
                                        <span style={{
                                           background: isSelected ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                                           color: isSelected ? 'white' : '#334155',
                                           borderRadius: '999px',
                                           padding: '1px 6px',
                                           fontSize: '9px',
                                           fontWeight: 800
                                        }}>
                                           {count}
                                        </span>
                                     )}
                                  </button>
                               );
                            })}
                         </div>
                      ) : null;
                   })()}

                   {/* NiceSelect Ingredient Dropdown */}
                   <div className="mapping-selector" style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Add Ingredient</label>
                      <NiceSelect
                        placeholder="Search ingredient to add..."
                        options={ingredientOptions}
                        value=""
                        onChange={ingId => {
                          const p = ingredientSuggestions.find(item => String(item.id) === String(ingId)) || (products || []).find(item => String(item.id) === String(ingId));
                          if (!p) return;

                          const allGroupOptions = (selectedProduct.variantMappings || []).flatMap(vm => {
                             const gOptions = (Array.isArray(vm.variantGroup?.options) && vm.variantGroup.options.length > 0)
                               ? vm.variantGroup.options
                               : (variantGroups.find(g => String(g.id) === String(vm.variantGroup?.id))?.options || []);
                             return gOptions;
                          });

                          const activeVariantOption = recipeVariantTab !== 'all'
                            ? allGroupOptions.find(o => String(o.id) === String(recipeVariantTab))
                            : null;

                          const targetVoId = activeVariantOption?.id || null;
                          const isAlreadyAdded = (selectedProduct.recipeLines || []).some(r => {
                            const lineIngId = r.ingredient?.id || r.ingredientId;
                            const lineVoId = r.variantOption?.id || r.variantOptionId || null;
                            return String(lineIngId) === String(p.id) && String(lineVoId) === String(targetVoId);
                          });

                          if (isAlreadyAdded) {
                            notify('warning', `"${p.name}" is already in this recipe`);
                            return;
                          }

                          const ing = {
                            ...p,
                            id: p.id,
                            name: p.name,
                            productCode: p.productCode || '',
                            uomName: p.uom?.name || p.uomName || 'units',
                            uomShortName: p.uom?.shortName || p.uomShortName || p.uom?.name || '',
                            isIngredient: true
                          };

                          const newLine = {
                            ingredient: ing,
                            ingredientId: p.id,
                            ingredientName: p.name,
                            variantOption: activeVariantOption ? { id: activeVariantOption.id, name: activeVariantOption.name } : null,
                            variantOptionId: activeVariantOption?.id || null,
                            variantOptionName: activeVariantOption?.name || null,
                            quantity: 1,
                            isActive: true
                          };

                          setSelectedProduct(prev => ({
                            ...prev,
                            recipeLines: [...(prev?.recipeLines || []), newLine]
                          }));
                          notify('success', `Added "${p.name}"`);
                        }}
                      />
                   </div>

                   {/* Subtitle / Context for Variant */}
                   {recipeVariantTab !== 'all' && (() => {
                      const curOpt = (selectedProduct.variantMappings || []).flatMap(vm => {
                         const gOptions = (Array.isArray(vm.variantGroup?.options) && vm.variantGroup.options.length > 0)
                           ? vm.variantGroup.options
                           : (variantGroups.find(g => String(g.id) === String(vm.variantGroup?.id))?.options || []);
                         return gOptions;
                      }).find(o => String(o.id) === String(recipeVariantTab));
                      return (
                         <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, color: '#334155' }}>{curOpt?.name || 'Variant'} Recipe:</span>
                            <span>Specific items deducted for this variant. Base recipe items also apply.</span>
                         </div>
                      );
                   })()}

                   <div className="mappings-list">
                      {(() => {
                        const hasProductVariants = Boolean(selectedProduct.isVariant || (selectedProduct.variantMappings && selectedProduct.variantMappings.length > 0));
                        const filteredLines = (selectedProduct.recipeLines || []).filter(r => {
                          if (!hasProductVariants) return true;
                          const lineVoId = r.variantOption?.id || r.variantOptionId || null;
                          if (recipeVariantTab === 'all') {
                            return !lineVoId;
                          }
                          return String(lineVoId) === String(recipeVariantTab);
                        });

                        if (filteredLines.length === 0) {
                          const curOpt = (selectedProduct.variantMappings || []).flatMap(vm => {
                             const gOptions = (Array.isArray(vm.variantGroup?.options) && vm.variantGroup.options.length > 0)
                               ? vm.variantGroup.options
                               : (variantGroups.find(g => String(g.id) === String(vm.variantGroup?.id))?.options || []);
                             return gOptions;
                          }).find(o => String(o.id) === String(recipeVariantTab));
                          return (
                            <div className="recipe-empty-state">
                               <div className="empty-icon-circle">
                                  <FaCogs style={{ color: '#94a3b8', fontSize: '15px' }} />
                               </div>
                               <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '2px' }}>
                                  {recipeVariantTab === 'all' || !selectedProduct.isVariant ? 'No recipe ingredients added' : `No specific ingredients for ${curOpt?.name || 'variant'}`}
                               </div>
                               <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                  {recipeVariantTab === 'all' || !selectedProduct.isVariant
                                    ? 'Search and add raw ingredients above to configure consumption.'
                                    : 'Inherits base recipe ingredients.'}
                               </div>
                            </div>
                          );
                        }

                        return filteredLines.map((r, idx) => {
                          const rIngId = r.ingredient?.id || r.ingredientId;
                          const rVoId = r.variantOption?.id || r.variantOptionId || null;

                          return (
                            <div key={idx} className="recipe-item-row">
                               <div className="recipe-item-info">
                                  <span className="recipe-item-index">{idx + 1}</span>
                                  <div className="recipe-item-name-group">
                                     <strong className="recipe-item-title">{r.ingredient?.name || r.ingredientName}</strong>
                                     {r.ingredient?.productCode && (
                                       <span className="recipe-item-code">#{r.ingredient.productCode}</span>
                                     )}
                                     <span className="recipe-item-uom">
                                       {r.ingredient?.uomShortName || r.ingredient?.uomName || r.uomName || 'units'}
                                     </span>
                                     {r.variantOptionName && (
                                       <span className="recipe-item-variant">
                                         {r.variantOptionName}
                                       </span>
                                     )}
                                  </div>
                               </div>

                               <div className="recipe-item-actions">
                                  <div className="recipe-stepper">
                                     <button 
                                       type="button" 
                                       className="stepper-btn"
                                       onClick={() => {
                                          setSelectedProduct(prev => ({
                                             ...prev,
                                             recipeLines: (prev.recipeLines || []).map(line => {
                                                const lIngId = line.ingredient?.id || line.ingredientId;
                                                const lVoId = line.variantOption?.id || line.variantOptionId || null;
                                                if (String(lIngId) === String(rIngId) && String(lVoId) === String(rVoId)) {
                                                   return { ...line, quantity: Math.max(0, parseFloat((Math.max(0, line.quantity) - 1).toFixed(3))) };
                                                }
                                                return line;
                                             })
                                          }));
                                       }}
                                       title="Decrease quantity"
                                     >
                                        <FaMinus />
                                     </button>
                                     <input 
                                       type="number" 
                                       step="any"
                                       value={r.quantity} 
                                       onChange={e => {
                                          const qty = parseFloat(e.target.value) || 0;
                                          setSelectedProduct(prev => ({
                                             ...prev,
                                             recipeLines: (prev.recipeLines || []).map(line => {
                                                const lIngId = line.ingredient?.id || line.ingredientId;
                                                const lVoId = line.variantOption?.id || line.variantOptionId || null;
                                                if (String(lIngId) === String(rIngId) && String(lVoId) === String(rVoId)) {
                                                   return { ...line, quantity: qty };
                                                }
                                                return line;
                                             })
                                          }));
                                       }}
                                       className="stepper-input"
                                     />
                                     <button 
                                       type="button" 
                                       className="stepper-btn"
                                       onClick={() => {
                                          setSelectedProduct(prev => ({
                                             ...prev,
                                             recipeLines: (prev.recipeLines || []).map(line => {
                                                const lIngId = line.ingredient?.id || line.ingredientId;
                                                const lVoId = line.variantOption?.id || line.variantOptionId || null;
                                                if (String(lIngId) === String(rIngId) && String(lVoId) === String(rVoId)) {
                                                   return { ...line, quantity: parseFloat((Math.max(0, line.quantity) + 1).toFixed(3)) };
                                                }
                                                return line;
                                             })
                                          }));
                                       }}
                                       title="Increase quantity"
                                     >
                                        <FaPlus />
                                     </button>
                                     <span className="stepper-unit">
                                       {r.ingredient?.uomShortName || r.ingredient?.uomName || r.uomName || 'qty'}
                                     </span>
                                  </div>

                                  <div className="recipe-v-divider" />

                                  <div 
                                     className={`erp-switch ${r.isActive !== false ? 'active' : ''}`} 
                                     onClick={() => {
                                        setSelectedProduct(prev => ({
                                           ...prev,
                                           recipeLines: (prev.recipeLines || []).map(line => {
                                              const lIngId = line.ingredient?.id || line.ingredientId;
                                              const lVoId = line.variantOption?.id || line.variantOptionId || null;
                                              if (String(lIngId) === String(rIngId) && String(lVoId) === String(rVoId)) {
                                                 return { ...line, isActive: line.isActive === false };
                                              }
                                              return line;
                                           })
                                        }));
                                     }}
                                     title={r.isActive !== false ? "Active in recipe" : "Inactive in recipe"}
                                  >
                                     <div className="switch-knob"></div>
                                  </div>

                                  <button 
                                    type="button"
                                    className="recipe-delete-btn" 
                                    onClick={() => {
                                       setSelectedProduct(prev => ({
                                          ...prev,
                                          recipeLines: (prev.recipeLines || []).filter(line => {
                                             const lIngId = line.ingredient?.id || line.ingredientId;
                                             const lVoId = line.variantOption?.id || line.variantOptionId || null;
                                             return !(String(lIngId) === String(rIngId) && String(lVoId) === String(rVoId));
                                          })
                                       }));
                                    }} 
                                    title="Remove ingredient"
                                  >
                                     <FaTrashAlt style={{ fontSize: '11px' }} />
                                  </button>
                               </div>
                            </div>
                          );
                        });
                      })()}
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
                   {purchasingEnabled && (
                      <button 
                         className={`pricing-view-btn ${pricingView === 'purchase' ? 'active' : ''}`} 
                         onClick={() => setPricingView('purchase')}
                         style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: pricingView === 'purchase' ? '#fff1f2' : 'white', color: pricingView === 'purchase' ? '#991b1b' : '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', borderColor: pricingView === 'purchase' ? '#ef4444' : '#e2e8f0' }}
                      >
                         <FaBoxOpen style={{ marginRight: '8px' }} /> Purchase Pricing
                      </button>
                   )}
                </div>
                
                <div className="input-group">
                   <label>Default {pricingView === 'sales' ? 'Sale' : 'Purchase'} Pricelist (Optional)</label>
                   <NiceSelect 
                      placeholder="None (Optional)"
                      options={[
                         { value: '', label: 'None (Optional)' },
                         ...pricelists
                            .filter(pl => pl.pricelistType === (pricingView === 'sales' ? 'SALE' : 'PURCHASE'))
                            .map(pl => ({ value: pl.id, label: pl.name }))
                      ]}
                      value={selectedProduct.defaultPricelistId || ''}
                      onChange={plid => setSelectedProduct({...selectedProduct, defaultPricelistId: plid || null})}
                   />
                </div>
             </div>

             {pricingView === 'sales' ? (
               <div className="erp-section" style={{ marginTop: '16px' }}>
                  <div className="section-title"><FaMoneyBillWave /> Global Sales Metrics</div>
                  <div className="input-row">
                      <div className="input-group"><label>Base Sale Price <span style={{ color: '#ef4444' }}>*</span></label><input type="number" placeholder="0.00" value={selectedProduct.price === 0 || selectedProduct.price === '' || selectedProduct.price === null || selectedProduct.price === undefined || isNaN(selectedProduct.price) ? '' : selectedProduct.price} onChange={e => setSelectedProduct({...selectedProduct, price: e.target.value === '' ? '' : parseFloat(e.target.value)})} /></div>
                      <div className="input-group"><label>Global MRP</label><input type="number" placeholder="0.00" value={selectedProduct.mrp === 0 || selectedProduct.mrp === '' || selectedProduct.mrp === null || selectedProduct.mrp === undefined || isNaN(selectedProduct.mrp) ? '' : selectedProduct.mrp} onChange={e => setSelectedProduct({...selectedProduct, mrp: e.target.value === '' ? '' : parseFloat(e.target.value)})} /></div>
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
                  <div className="input-group"><label>Standard Purchase Cost</label><input type="number" placeholder="0.00" value={selectedProduct.costPrice === 0 || selectedProduct.costPrice === '' || selectedProduct.costPrice === null || selectedProduct.costPrice === undefined || isNaN(selectedProduct.costPrice) ? '' : selectedProduct.costPrice} onChange={e => setSelectedProduct({...selectedProduct, costPrice: e.target.value === '' ? '' : parseFloat(e.target.value)})} /></div>
               </div>
             )}

             {taxEnabled && (
                <div className="erp-section" style={{ marginTop: '16px' }}>
                   <div className="section-title"><FaClock /> Shared Tax Config</div>
                   <div className="input-row">
                      <div className="input-group"><label>Tax Rate (%)</label><input type="number" placeholder="0" value={selectedProduct.taxRate === 0 || selectedProduct.taxRate === '' || selectedProduct.taxRate === null || selectedProduct.taxRate === undefined || isNaN(selectedProduct.taxRate) ? '' : selectedProduct.taxRate} onChange={e => setSelectedProduct({...selectedProduct, taxRate: e.target.value === '' ? '' : parseFloat(e.target.value)})} /></div>
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
                            if (!group) return;
                            setSelectedProduct(prev => ({
                               ...prev,
                               isVariant: true,
                               variantMappings: [...(prev.variantMappings || []), { variantGroup: group, isRequired: true }]
                            }));
                         }}
                       />
                    </div>
                 </div>

                <div className="mappings-list">
                   {(selectedProduct.variantMappings || []).map((m, idx) => {
                     const groupOptions = (Array.isArray(m.variantGroup?.options) && m.variantGroup.options.length > 0)
                        ? m.variantGroup.options
                        : (variantGroups.find(g => String(g.id) === String(m.variantGroup?.id))?.options || []);
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
                            ) : <div className="variant-options-list" style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                                {groupOptions.map(opt => {
                                   const pricing = (selectedProduct.variantPricings || []).find(vp => String(vp.variantOption?.id || vp.variantOptionId || '') === String(opt.id));
                                   const currentVal = pricing && pricing.overridePrice !== undefined && pricing.overridePrice !== null ? pricing.overridePrice : '';
                                   const currentCost = pricing && pricing.costPrice !== undefined && pricing.costPrice !== null ? pricing.costPrice : '';
                                   const isEnabled = pricing?.isAvailable !== false;

                                   return (
                                      <div key={opt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 14px', background: isEnabled ? '#f8fafc' : '#f1f5f9', borderRadius: '10px', border: '1px solid #e2e8f0', opacity: isEnabled ? 1 : 0.65, transition: 'all 0.2s' }}>
                                         {/* Left: Name, Base Price & Enabled Switch */}
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '160px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                                               <input
                                                 type="checkbox"
                                                 checked={isEnabled}
                                                 style={{ width: '16px', height: '16px', accentColor: '#ea580c', cursor: 'pointer' }}
                                                 onChange={e => {
                                                   const otherPricings = (selectedProduct.variantPricings || []).filter(vp => String(vp.variantOption?.id || vp.variantOptionId || '') !== String(opt.id));
                                                   setSelectedProduct({
                                                     ...selectedProduct,
                                                     variantPricings: [...otherPricings, {
                                                       ...pricing,
                                                       variantOption: opt,
                                                       overridePrice: pricing?.overridePrice ?? null,
                                                       costPrice: pricing?.costPrice ?? null,
                                                       isAvailable: e.target.checked
                                                     }]
                                                   });
                                                 }}
                                               />
                                               <span style={{ fontSize: '11px', fontWeight: 700, color: isEnabled ? '#059669' : '#94a3b8', whiteSpace: 'nowrap' }}>
                                                  {isEnabled ? 'Enabled' : 'Disabled'}
                                               </span>
                                            </label>
                                            <div>
                                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{opt.name}</div>
                                              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Base: ₹{opt.additionalPrice || 0}</div>
                                            </div>
                                         </div>

                                         {/* Right: Pricing Inputs (Sale & Purchase) */}
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                            {/* Sale Price Input */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', padding: '4px 8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                               <span style={{ fontSize: '10px', fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                  Sale
                                               </span>
                                               <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>₹</span>
                                               <input 
                                                  type="number" 
                                                  placeholder="0.00"
                                                  disabled={!isEnabled}
                                                  style={{ width: '80px', border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}
                                                  value={currentVal === 0 || currentVal === '' || currentVal === null || currentVal === undefined || isNaN(currentVal) ? '' : currentVal}
                                                  onChange={e => {
                                                     const newVal = e.target.value === '' ? '' : parseFloat(e.target.value);
                                                     const otherPricings = (selectedProduct.variantPricings || []).filter(vp => String(vp.variantOption?.id || vp.variantOptionId || '') !== String(opt.id));
                                                     const existingCost = pricing?.costPrice !== undefined && pricing?.costPrice !== null ? pricing.costPrice : null;
                                                     setSelectedProduct({
                                                        ...selectedProduct,
                                                        variantPricings: [...otherPricings, {
                                                          ...pricing,
                                                          variantOption: opt,
                                                          overridePrice: newVal === '' ? null : (isNaN(newVal) ? null : newVal),
                                                          costPrice: existingCost,
                                                          isAvailable: isEnabled
                                                        }]
                                                     });
                                                  }}
                                               />
                                            </div>

                                            {/* Purchase Cost Input (When Purchasing Module is Enabled) */}
                                            {purchasingEnabled && (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', padding: '4px 8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                                 <span style={{ fontSize: '10px', fontWeight: 800, color: '#991b1b', background: '#ffe4e6', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Purchase
                                                 </span>
                                                 <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>₹</span>
                                                 <input 
                                                    type="number" 
                                                    placeholder="0.00"
                                                    disabled={!isEnabled}
                                                    style={{ width: '80px', border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}
                                                    value={currentCost === 0 || currentCost === '' || currentCost === null || currentCost === undefined || isNaN(currentCost) ? '' : currentCost}
                                                    onChange={e => {
                                                       const newCost = e.target.value === '' ? '' : parseFloat(e.target.value);
                                                       const otherPricings = (selectedProduct.variantPricings || []).filter(vp => String(vp.variantOption?.id || vp.variantOptionId || '') !== String(opt.id));
                                                       const existingSale = pricing?.overridePrice !== undefined && pricing?.overridePrice !== null ? pricing.overridePrice : null;
                                                       setSelectedProduct({
                                                          ...selectedProduct,
                                                          variantPricings: [...otherPricings, {
                                                            ...pricing,
                                                            variantOption: opt,
                                                            overridePrice: existingSale,
                                                            costPrice: newCost === '' ? null : (isNaN(newCost) ? null : newCost),
                                                            isAvailable: isEnabled
                                                          }]
                                                       });
                                                    }}
                                                 />
                                              </div>
                                            )}
                                         </div>
                                      </div>
                                   );
                                })}
                             </div>}
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
                      options={(products || [])
                        .filter(p => p && p.id !== selectedProduct?.id && !(selectedProduct?.upsells || []).some(u => u.upsellProduct?.id === p.id))
                        .map(p => ({ value: p.id, label: p.name }))}
                      value=""
                      onChange={pid => {
                        const prod = (products || []).find(p => p.id === pid);
                        setSelectedProduct({
                           ...selectedProduct,
                           upsells: [...(selectedProduct?.upsells || []), { upsellProduct: prod, isActive: true }]
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
        /* Standard Recipe BOM Styles */
        .recipe-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 12px;
          margin-bottom: 6px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
          transition: all 0.15s ease;
        }
        .recipe-item-row:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
        }
        .recipe-item-info {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .recipe-item-index {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .recipe-item-name-group {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .recipe-item-title {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .recipe-item-code {
          font-size: 9px;
          font-weight: 600;
          color: #64748b;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 1px 5px;
          border-radius: 4px;
        }
        .recipe-item-uom {
          display: inline-flex;
          align-items: center;
          padding: 1px 6px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .recipe-item-variant {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #ea580c;
          font-size: 9px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
          text-transform: capitalize;
        }
        .recipe-item-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .recipe-stepper {
          display: flex;
          align-items: center;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 2px;
          transition: border-color 0.15s;
        }
        .recipe-stepper:focus-within {
          border-color: #f97316;
          box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.12);
        }
        .stepper-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: #ffffff;
          border-radius: 6px;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          transition: all 0.15s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .stepper-btn:hover {
          background: #f97316;
          color: #ffffff;
        }
        .stepper-input {
          width: 46px;
          border: none;
          background: transparent;
          font-size: 12.5px;
          font-weight: 700;
          color: #0f172a;
          text-align: center;
          outline: none;
          padding: 0 2px;
        }
        .stepper-unit {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          padding: 0 6px 0 2px;
          letter-spacing: 0.02em;
          user-select: none;
        }
        .recipe-v-divider {
          width: 1px;
          height: 18px;
          background: #e2e8f0;
        }
        .recipe-delete-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .recipe-delete-btn:hover {
          background: #fef2f2;
          color: #ef4444;
        }
        .recipe-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px 16px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          text-align: center;
          margin-top: 6px;
        }
        .empty-icon-circle {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 6px;
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

        .drawer-tabs {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px;
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          margin-bottom: 16px;
          position: sticky;
          top: -20px;
          z-index: 10;
          align-self: flex-start;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          overflow-x: auto;
          scrollbar-width: none;
          max-width: 100%;
        }
        .drawer-tabs::-webkit-scrollbar {
          display: none;
        }
        .drawer-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 7px 16px;
          height: 36px;
          border: none;
          background: transparent;
          color: #64748b;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          border-radius: 12px;
          white-space: nowrap;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .drawer-tab:hover:not(.active) {
          color: #334155;
          background: #f8fafc;
        }
        .drawer-tab.active {
          background: #f97316;
          color: white !important;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
        }
        .drawer-tab.active svg,
        .drawer-tab.active span {
          color: white !important;
        }

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
