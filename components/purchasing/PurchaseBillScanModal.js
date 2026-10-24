import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useCurrencyDecimals } from '../../hooks/useCurrencyConfig';
import {
  FaCamera, FaUpload, FaCheck, FaTimes, FaWarehouse, FaUserTie,
  FaCalendarAlt, FaHashtag, FaRobot, FaMagic, FaExchangeAlt,
  FaPlus, FaTrash, FaCheckCircle, FaExclamationTriangle, FaSearch,
  FaFileInvoiceDollar, FaLayerGroup, FaArrowRight, FaSpinner, FaEye
} from 'react-icons/fa';
import api from '../../utils/api';
import NiceSelect from '../NiceSelect';
import PremiumDateTimePicker from '../PremiumDateTimePicker';

const cleanStr = (val, fb = '') => String(val ?? fb).trim();
const normalizeKey = (val) => cleanStr(val).toLowerCase().replace(/[^a-z0-9]/g, '');

const trimPriceSuffix = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/\s*[\(\[]?\s*(?:(?:RS|INR|MRP|₹)[\s\.]*\d+(?:\.\d+)?|\d+[\s\.]*(?:RS|INR|\/-))\s*[\)\]]?\s*$/i, '')
    .trim();
};

const getAiParseEndpoint = () => {
  // 1. Dedicated purchase bill endpoint env var if defined
  const dedicatedEndpoint = cleanStr(process.env.NEXT_PUBLIC_AI_PURCHASE_BILL_URL);
  if (dedicatedEndpoint) return dedicatedEndpoint;

  // 2. If generic AI parse url is configured, ensure it targets parse-purchase-bill, not parse-menu
  const genericEndpoint = cleanStr(process.env.NEXT_PUBLIC_AI_PARSE_URL);
  if (genericEndpoint) {
    if (genericEndpoint.includes('/api/ai/parse-menu')) {
      return genericEndpoint.replace('/api/ai/parse-menu', '/api/ai/parse-purchase-bill');
    }
    if (genericEndpoint.includes('/api/ai/parse-purchase-bill')) {
      return genericEndpoint;
    }
  }

  // 3. Inspect runtime environment (Cloudflare Pages or native shell)
  if (typeof window !== 'undefined') {
    const origin = window.location?.origin || '';
    const isNativeShell = window.Capacitor?.isNativePlatform?.();

    // If running on Cloudflare Pages (*.pages.dev) where Next.js /api routes don't exist:
    if (origin.includes('pages.dev')) {
      return 'https://cafe-test-qr-frontend.vercel.app/api/ai/parse-purchase-bill';
    }

    if (isNativeShell) {
      if (origin && !origin.includes('localhost') && !origin.startsWith('file:') && !origin.includes('pages.dev')) {
        return `${origin}/api/ai/parse-purchase-bill`;
      }
      return 'https://cafe-test-qr-frontend.vercel.app/api/ai/parse-purchase-bill';
    }
  }

  // 4. Default relative path for Next.js server (e.g. on Vercel or local dev)
  return '/api/ai/parse-purchase-bill';
};

export default function PurchaseBillScanModal({
  isOpen,
  onClose,
  vendors = [],
  warehouses = [],
  products = [],
  warehouseStock = {},
  currencySymbol = '',
  onApplyToPo,
  onDirectCompleted,
  onProductsCreated,
  toast = () => { },
}) {
  const currencyDecimals = useCurrencyDecimals();
  const [step, setStep] = useState('upload'); // 'upload' | 'scanning' | 'review' | 'saving'
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scanProgressText, setScanProgressText] = useState('Reading document...');
  const [error, setError] = useState(null);

  // Bill Header Data
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 16));
  const [detectedSupplierName, setDetectedSupplierName] = useState('');
  const [rawBillTotals, setRawBillTotals] = useState({ subtotal: 0, taxTotal: 0, grandTotal: 0 });

  // Bill Items Data
  const [billItems, setBillItems] = useState([]);

  // Hidden file inputs
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize default warehouse
  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !selectedWarehouseId) {
      const def = warehouses.find(w => w.isDefault) || warehouses[0];
      if (def) setSelectedWarehouseId(String(def.id));
    }
  }, [warehouses, selectedWarehouseId]);

  // Options for Dropdowns
  const vendorOptions = useMemo(() => {
    return [
      { value: '', label: 'Select Supplier / Vendor...' },
      ...vendors.map(v => ({
        value: String(v.id),
        label: v.name || v.businessName || 'Unnamed Vendor'
      }))
    ];
  }, [vendors]);

  const warehouseOptions = useMemo(() => {
    return [
      { value: '', label: 'Select Receiving Warehouse...' },
      ...warehouses.map(w => ({
        value: String(w.id),
        label: w.name || 'Warehouse'
      }))
    ];
  }, [warehouses]);

  const productOptions = useMemo(() => {
    return [
      { value: '__NEW__', label: '+ Treat as New Item' },
      ...products.map(p => {
        const isIng = p.isIngredient === true || String(p.productType).toUpperCase() === 'INGREDIENT';
        return {
          value: String(p.id),
          label: `${p.name} [${isIng ? 'Ingredient' : 'Product'}]`
        };
      })
    ];
  }, [products]);

  // Compress photo  on device
  const compressImage = async (fileToCompress) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(fileToCompress);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 2048;
          let width = img.width;
          let height = img.height;

          if (width > height && width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleSelectFile = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setError(null);
    }
  };

  // Branch catalog matching helper
  const matchWithBranch = (extractedItem, productsList) => {
    const fullName = cleanStr(extractedItem.name || extractedItem.rawName);
    const billNameKey = normalizeKey(fullName);
    const catalogCandidateKey = normalizeKey(extractedItem.matchedCatalogItem);

    // 1. Check if AI matched exact catalog candidate
    if (catalogCandidateKey) {
      const direct = productsList.find(p => normalizeKey(p.name) === catalogCandidateKey);
      if (direct) {
        const isIng = direct.isIngredient === true || String(direct.productType).toUpperCase() === 'INGREDIENT';
        return { matchedProduct: direct, isIngredient: isIng, confidence: 'HIGH' };
      }
    }

    // 2. Exact name match
    const exact = productsList.find(p => normalizeKey(p.name) === billNameKey);
    if (exact) {
      const isIng = exact.isIngredient === true || String(exact.productType).toUpperCase() === 'INGREDIENT';
      return { matchedProduct: exact, isIngredient: isIng, confidence: 'HIGH' };
    }

    // 3. Substring / Token overlap match (require strong similarity to avoid overriding multi-word SKU with single generic word)
    const tokens = fullName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let bestMatch = null;
    let bestScore = 0;

    for (const p of productsList) {
      const pNameKey = normalizeKey(p.name);
      if (pNameKey && billNameKey.includes(pNameKey) && pNameKey.length >= 6) {
        const isIng = p.isIngredient === true || String(p.productType).toUpperCase() === 'INGREDIENT';
        return { matchedProduct: p, isIngredient: isIng, confidence: 'MEDIUM' };
      }

      const pTokens = p.name.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const overlap = tokens.filter(t => pTokens.some(pt => pt === t || (pt.length > 4 && t.includes(pt))));
      if (overlap.length > bestScore) {
        bestScore = overlap.length;
        bestMatch = p;
      }
    }

    if (bestMatch && bestScore >= 2) {
      const isIng = bestMatch.isIngredient === true || String(bestMatch.productType).toUpperCase() === 'INGREDIENT';
      return { matchedProduct: bestMatch, isIngredient: isIng, confidence: 'MEDIUM' };
    }

    // 4. Default: New item, infer ingredient from AI guess
    return {
      matchedProduct: null,
      isIngredient: Boolean(extractedItem.isIngredientLikely),
      confidence: 'NEW'
    };
  };

  // Trigger AI Scan
  const startScan = async () => {
    if (!file) return;

    setStep('scanning');
    setError(null);
    setScanProgressText('Compressing and preparing bill...');

    try {
      const base64Data = await compressImage(file);
      setScanProgressText('Deciphering invoice lines, rates & quantities with AI...');

      const res = await fetch(getAiParseEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Data
        })
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        throw new Error(json.details || json.message || 'Failed to scan bill. Please ensure image is clear.');
      }

      const data = json.data || {};

      // Match vendor if possible
      setDetectedSupplierName(data.supplierName || '');
      if (data.supplierName) {
        const sKey = normalizeKey(data.supplierName);
        const matchedVendor = vendors.find(v => {
          const vKey = normalizeKey(v.name || v.businessName || '');
          return vKey && (sKey.includes(vKey) || vKey.includes(sKey));
        });
        if (matchedVendor) {
          setSelectedVendorId(String(matchedVendor.id));
        }
      }

      // Invoice # & Date
      if (data.invoiceNumber) setInvoiceNumber(data.invoiceNumber);
      if (data.invoiceDate) {
        try {
          const parsedD = new Date(data.invoiceDate);
          if (!isNaN(parsedD.getTime())) {
            setPurchaseDate(parsedD.toISOString().slice(0, 16));
          }
        } catch { /* use current */ }
      }

      setRawBillTotals({
        subtotal: data.subtotal || 0,
        taxTotal: data.taxTotal || 0,
        grandTotal: data.grandTotal || 0,
      });

      // Align Line Items
      setScanProgressText('Aligning with branch products and ingredients...');
      const alignedLines = (data.items || []).map((it, idx) => {
        const cleanItemName = trimPriceSuffix(it.name) || trimPriceSuffix(it.rawName) || it.name || `Item ${idx + 1}`;
        const { matchedProduct, isIngredient, confidence } = matchWithBranch({ ...it, name: cleanItemName }, products);

        return {
          id: `line_${idx}_${Date.now()}`,
          selected: true,
          billName: cleanItemName,
          rawName: it.rawName || it.name || '',
          productId: matchedProduct ? String(matchedProduct.id) : '__NEW__',
          productName: matchedProduct ? matchedProduct.name : cleanItemName,
          isIngredient: isIngredient,
          confidence: confidence,
          quantity: it.quantity || 1,
          unitOfMeasure: matchedProduct?.uomName || it.unitOfMeasure || 'units',
          uomPrecision: matchedProduct?.uomPrecision ?? null,
          unitPrice: it.unitPrice || 0,
          taxRate: it.taxRate || 0,
          lineTotal: it.lineTotal || (it.quantity * it.unitPrice),
          oldCostPrice: matchedProduct?.costPrice || 0,
          currentStock: matchedProduct ? (warehouseStock[matchedProduct.id] ?? '—') : '—',
        };
      });

      setBillItems(alignedLines);
      setStep('review');
    } catch (err) {
      console.error('Scan error:', err);
      setError(err.message || 'Error occurred while scanning the bill.');
      setStep('upload');
    }
  };

  // Line editing helpers
  const handleToggleLine = (idx) => {
    setBillItems(prev => prev.map((l, i) => i === idx ? { ...l, selected: !l.selected } : l));
  };

  const handleUpdateItemName = (idx, newName) => {
    setBillItems(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const wasMapped = l.productId && l.productId !== '__NEW__';
      const isSameAsMapped = wasMapped && products.some(p => String(p.id) === String(l.productId) && p.name === newName);
      return {
        ...l,
        productName: newName,
        billName: newName,
        productId: (wasMapped && !isSameAsMapped) ? '__NEW__' : l.productId,
        confidence: (wasMapped && !isSameAsMapped) ? 'NEW' : l.confidence,
      };
    }));
  };

  const handleUpdateLineField = (idx, field, val) => {
    setBillItems(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: val };
      if (field === 'productName') {
        updated.billName = val;
      } else if (field === 'billName') {
        updated.productName = val;
      }
      if (field === 'quantity' || field === 'unitPrice' || field === 'taxRate') {
        const q = parseFloat(field === 'quantity' ? val : updated.quantity) || 0;
        const p = parseFloat(field === 'unitPrice' ? val : updated.unitPrice) || 0;
        const t = parseFloat(field === 'taxRate' ? val : updated.taxRate) || 0;
        const sub = q * p;
        updated.lineTotal = +(sub + (sub * t / 100)).toFixed(currencyDecimals);
      }
      return updated;
    }));
  };

  const handleProductMappingChange = (idx, newProductId) => {
    setBillItems(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      if (newProductId === '__NEW__') {
        return {
          ...l,
          productId: '__NEW__',
          productName: l.billName || l.productName,
          confidence: 'NEW',
          oldCostPrice: 0,
          currentStock: '—'
        };
      }
      const prod = products.find(p => String(p.id) === String(newProductId));
      if (!prod) return l;

      const isIng = prod.isIngredient === true || String(prod.productType).toUpperCase() === 'INGREDIENT';
      return {
        ...l,
        productId: String(prod.id),
        productName: prod.name,
        isIngredient: isIng,
        unitOfMeasure: prod.uomName || l.unitOfMeasure,
        uomPrecision: prod.uomPrecision ?? null,
        confidence: 'MANUAL',
        oldCostPrice: prod.costPrice || 0,
        currentStock: warehouseStock[prod.id] ?? '—'
      };
    }));
  };

  const handleToggleIngredient = (idx) => {
    setBillItems(prev => prev.map((l, i) => i === idx ? { ...l, isIngredient: !l.isIngredient } : l));
  };

  const handleDeleteLine = (idx) => {
    setBillItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddCustomLine = () => {
    const newLine = {
      id: `custom_${Date.now()}`,
      selected: true,
      billName: 'New Item',
      rawName: 'Manual Entry',
      productId: '__NEW__',
      productName: 'New Item',
      isIngredient: true,
      confidence: 'NEW',
      quantity: 1,
      unitOfMeasure: 'units',
      unitPrice: 0,
      taxRate: 0,
      lineTotal: 0,
      oldCostPrice: 0,
      currentStock: '—'
    };
    setBillItems(prev => [...prev, newLine]);
  };

  // Calculated totals
  const calculatedTotals = useMemo(() => {
    const active = billItems.filter(l => l.selected);
    const subtotal = active.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
    const grandTotal = active.reduce((s, l) => s + (parseFloat(l.lineTotal) || 0), 0);
    const taxTotal = grandTotal - subtotal;
    return {
      subtotal: +subtotal.toFixed(currencyDecimals),
      taxTotal: +Math.max(0, taxTotal).toFixed(currencyDecimals),
      grandTotal: +grandTotal.toFixed(currencyDecimals),
      count: active.length
    };
  }, [billItems]);

  // Helper to ensure any __NEW__ items are auto-created in database and have real UUIDs
  const ensureProductsExist = async (linesToEnsure) => {
    const newLines = linesToEnsure.filter(l => l.productId === '__NEW__' || !l.productId);
    if (newLines.length === 0) {
      return linesToEnsure;
    }

    setScanProgressText(`Provisioning ${newLines.length} new items in catalog...`);

    // Deduplicate by normalized name
    const uniqueMap = new Map();
    for (const line of newLines) {
      const name = cleanStr(line.productName || line.billName || 'Purchase Item');
      const key = normalizeKey(name);
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          name,
          price: line.isIngredient ? 0 : (parseFloat(line.unitPrice) || 0),
          costPrice: parseFloat(line.unitPrice) || 0,
          isIngredient: Boolean(line.isIngredient),
          productType: line.isIngredient ? 'INGREDIENT' : 'PRODUCT',
          taxRate: parseFloat(line.taxRate) || 0,
          isActive: true,
          isAvailable: true,
        });
      }
    }

    const payload = Array.from(uniqueMap.values());
    const res = await api.post('/api/v1/products/bulk', payload);
    const createdList = res.data?.data || [];

    const createdMap = new Map();
    for (const prod of createdList) {
      if (prod && prod.id) {
        createdMap.set(normalizeKey(prod.name), prod);
      }
    }

    if (onProductsCreated && createdList.length > 0) {
      onProductsCreated(createdList);
    }

    return linesToEnsure.map(line => {
      if (line.productId !== '__NEW__' && line.productId) {
        return line;
      }
      const key = normalizeKey(line.productName || line.billName || '');
      const matched = createdMap.get(key);
      if (matched) {
        return {
          ...line,
          productId: String(matched.id),
          productName: matched.name,
          confidence: 'NEW_CREATED',
        };
      }
      return line;
    });
  };

  // Option A: Populate PO Form
  const handleApplyToPurchaseOrder = async () => {
    const activeLines = billItems.filter(l => l.selected);
    if (activeLines.length === 0) {
      toast('Please select at least one item from the bill', 'error');
      return;
    }

    setStep('saving');
    setError(null);

    try {
      const resolvedLines = await ensureProductsExist(activeLines);

      // Verify all lines have a valid productId
      const unresolved = resolvedLines.find(l => !l.productId || l.productId === '__NEW__');
      if (unresolved) {
        throw new Error(`Failed to provision product for "${unresolved.billName}". Please map it to an existing product.`);
      }

      const poLines = resolvedLines.map(l => {
        const q = parseFloat(l.quantity) || 0;
        const p = parseFloat(l.unitPrice) || 0;
        const t = parseFloat(l.taxRate) || 0;
        const sub = q * p;
        const taxAmt = +(sub * t / 100).toFixed(currencyDecimals);

        return {
          productId: l.productId,
          productName: l.productName || l.billName,
          isIngredient: l.isIngredient,
          quantity: q,
          unitPrice: p,
          unitOfMeasure: l.unitOfMeasure,
          taxRate: t,
          taxAmount: taxAmt,
          discountAmount: 0,
          lineTotal: +(sub + taxAmt).toFixed(currencyDecimals),
        };
      });

      onApplyToPo({
        vendorId: selectedVendorId,
        warehouseId: selectedWarehouseId,
        orderDate: purchaseDate,
        reference: invoiceNumber,
        lines: poLines,
        ...calculatedTotals
      });

      toast(`✅ Loaded ${poLines.length} items from bill into Purchase Order!`, 'success');
      onClose();
    } catch (err) {
      console.error('Error preparing lines for Purchase Order:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to prepare items for Purchase Order.');
      setStep('review');
    }
  };

  // Option B: Direct Save & Complete via Existing PO API
  const handleDirectComplete = async () => {
    const activeLines = billItems.filter(l => l.selected);
    if (!selectedVendorId) {
      toast('Please select a Supplier / Vendor', 'error');
      return;
    }
    if (!selectedWarehouseId) {
      toast('Please select a Receiving Warehouse', 'error');
      return;
    }
    if (activeLines.length === 0) {
      toast('Please select at least one item from the bill', 'error');
      return;
    }

    setStep('saving');
    setError(null);

    try {
      const resolvedLines = await ensureProductsExist(activeLines);

      const unresolved = resolvedLines.find(l => !l.productId || l.productId === '__NEW__');
      if (unresolved) {
        throw new Error(`Failed to provision product for "${unresolved.billName}". Please map it to an existing product.`);
      }

      const poLines = resolvedLines.map(l => {
        const q = parseFloat(l.quantity) || 0;
        const p = parseFloat(l.unitPrice) || 0;
        const t = parseFloat(l.taxRate) || 0;
        const sub = q * p;
        const taxAmt = +(sub * t / 100).toFixed(currencyDecimals);

        return {
          productId: l.productId,
          productName: l.productName || l.billName,
          quantity: q,
          unitPrice: p,
          unitOfMeasure: l.unitOfMeasure,
          taxRate: t,
          taxAmount: taxAmt,
          discountAmount: 0,
          lineTotal: +(sub + taxAmt).toFixed(currencyDecimals),
        };
      });

      const payload = {
        vendorId: selectedVendorId,
        warehouseId: selectedWarehouseId,
        orderDate: new Date(purchaseDate).toISOString(),
        orderStatus: 'COMPLETED',
        isReceived: true,
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        reference: invoiceNumber || 'AI-SCANNED-BILL',
        description: `Scanned from bill: ${invoiceNumber || detectedSupplierName || 'Supplier Bill'}`,
        lines: poLines,
        totalAmount: calculatedTotals.subtotal,
        totalTaxAmount: calculatedTotals.taxTotal,
        grandTotal: calculatedTotals.grandTotal
      };

      const res = await api.post('/api/v1/purchase/orders', payload);

      if (res.data?.success) {
        toast(`✅ Successfully created Purchase Order & updated warehouse stocks!`, 'success');
        if (onDirectCompleted) onDirectCompleted(res.data.data);
        onClose();
      } else {
        throw new Error(res.data?.message || 'Failed to complete purchase order.');
      }
    } catch (err) {
      console.error('Direct purchase order creation failed:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to complete purchase order.');
      setStep('review');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="bill-scan-overlay">
      <div className="bill-scan-modal">
        {/* Modal Header */}
        <div className="modal-header">
          <div className="header-title-box">
            <span className="ai-badge-icon"><FaRobot /> AI Scan</span>
            <div>
              <h2>Purchase Bill & Receipt Scanner</h2>
              <p className="header-sub">Scan supplier bills, invoices & receipts to update warehouse stock automatically</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} title="Close"><FaTimes /></button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {error && (
            <div className="scan-alert-error">
              <FaExclamationTriangle />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="upload-view">
              {/* Native Inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleSelectFile}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleSelectFile}
              />

              {!preview ? (
                <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
                  <div className="dropzone-icon-ring">
                    <FaFileInvoiceDollar />
                  </div>
                  <h3>Take a Photo or Upload Bill</h3>
                  <p>Supports printed invoices, wholesale cash receipts, and handwritten grocery/supply chits.</p>

                  <div className="upload-actions" onClick={e => e.stopPropagation()}>
                    <button className="action-btn camera" onClick={() => cameraInputRef.current?.click()}>
                      <FaCamera /> Take Photo
                    </button>
                    <button className="action-btn gallery" onClick={() => fileInputRef.current?.click()}>
                      <FaUpload /> Choose from Files / Gallery
                    </button>
                  </div>
                </div>
              ) : (
                <div className="preview-container">
                  <div className="preview-media-box">
                    <img src={preview} alt="Selected Purchase Bill" />
                  </div>
                  <div style={{ margin: '12px 0 6px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaMagic style={{ color: '#ea580c', flexShrink: 0 }} />
                    <span><strong>Pro Tip:</strong> For fastest and most accurate scan, crop directly to the bill text and avoid dark background screens or window frames.</span>
                  </div>
                  <div className="preview-toolbar">
                    <button className="toolbar-btn secondary" onClick={() => { setFile(null); setPreview(null); }}>
                      <FaTimes /> Change Image
                    </button>
                    <button className="toolbar-btn primary" onClick={startScan}>
                      <FaMagic /> Start AI Scan
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: SCANNING */}
          {step === 'scanning' && (
            <div className="scanning-view">
              <div className="scanner-animation-box">
                {preview && <img src={preview} alt="Scanning" className="scanning-img" />}
                <div className="scanner-laser-line"></div>
              </div>
              <div className="scanning-status-box">
                <FaSpinner className="spinner-icon" />
                <h3>Deciphering Bill & Matching Items</h3>
                <p>{scanProgressText}</p>
              </div>
            </div>
          )}

          {/* STEP 3 & 4: REVIEW & RECONCILIATION */}
          {(step === 'review' || step === 'saving') && (
            <div className="review-view">
              {/* Bill Details Bar */}
              <div className="bill-header-grid">
                {/* Manual Vendor Selection */}
                <div className="header-field">
                  <label><FaUserTie /> Supplier / Vendor <span className="req">*</span></label>
                  <NiceSelect
                    options={vendorOptions}
                    value={selectedVendorId}
                    onChange={setSelectedVendorId}
                    placeholder="Choose Supplier..."
                  />
                  {detectedSupplierName && !selectedVendorId && (
                    <span className="field-hint-ai">Detected: &quot;{detectedSupplierName}&quot;</span>
                  )}
                </div>

                {/* Manual Warehouse Selection */}
                <div className="header-field">
                  <label><FaWarehouse /> Receiving Warehouse <span className="req">*</span></label>
                  <NiceSelect
                    options={warehouseOptions}
                    value={selectedWarehouseId}
                    onChange={setSelectedWarehouseId}
                    placeholder="Choose Warehouse..."
                  />
                </div>

                {/* Supplier Invoice Number */}
                <div className="header-field">
                  <label><FaHashtag /> Invoice / Bill Ref</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. INV-2024-001"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                  />
                </div>

                {/* Purchase Date */}
                <div className="header-field">
                  <label><FaCalendarAlt /> Order Date & Time</label>
                  <PremiumDateTimePicker
                    value={purchaseDate}
                    onChange={setPurchaseDate}
                  />
                </div>
              </div>

              {/* Items Section Header */}
              <div className="items-header-bar">
                <div>
                  <h4>Scanned Line Items ({calculatedTotals.count} items included)</h4>
                  <p>Verify quantities, cost prices, and whether each item is an Ingredient or Product</p>
                </div>
                <button className="add-line-btn" onClick={handleAddCustomLine}>
                  <FaPlus /> Add Line
                </button>
              </div>

              {/* Responsive Items Presentation */}
              <div className="items-container">
                {/* Desktop View Table */}
                <div className="desktop-table-wrapper">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}></th>
                        <th style={{ minWidth: '220px' }}>Product Name (Editable)</th>
                        <th style={{ minWidth: '180px' }}>Branch Product Mapping</th>
                        <th style={{ width: '90px' }}>Type</th>
                        <th style={{ width: '80px' }}>Qty</th>
                        <th style={{ width: '80px' }}>Unit</th>
                        <th style={{ width: '100px' }}>Cost Price</th>
                        <th style={{ width: '70px' }}>Tax %</th>
                        <th style={{ width: '100px' }}>Total</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {billItems.map((item, idx) => (
                        <tr key={item.id} className={!item.selected ? 'row-deselected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => handleToggleLine(idx)}
                              className="checkbox-input"
                            />
                          </td>
                          <td>
                            <div className="item-name-cell">
                              <input
                                type="text"
                                className="cell-input item-name-input"
                                value={item.productName ?? item.billName ?? ''}
                                onChange={e => handleUpdateItemName(idx, e.target.value)}
                                placeholder="Enter product name..."
                                title="Click to edit product name"
                              />
                              <div className="item-sub-meta">
                                {item.rawName && item.rawName !== (item.productName || item.billName) && (
                                  <span className="raw-bill-badge" title={`Original text on bill: ${item.rawName}`}>
                                    Bill: {item.rawName}
                                  </span>
                                )}
                                {item.confidence === 'HIGH' && <span className="match-tag high">High Match</span>}
                                {item.confidence === 'MEDIUM' && <span className="match-tag medium">Fuzzy Match</span>}
                                {item.confidence === 'NEW' && <span className="match-tag new">New Item</span>}
                                {item.confidence === 'NEW_CREATED' && <span className="match-tag new">Created</span>}
                              </div>
                            </div>
                          </td>
                          <td>
                            <NiceSelect
                              options={productOptions}
                              value={item.productId}
                              onChange={(val) => handleProductMappingChange(idx, val)}
                              maxHeight={220}
                              style={{ minWidth: '180px' }}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`type-pill ${item.isIngredient ? 'ingredient' : 'product'}`}
                              onClick={() => handleToggleIngredient(idx)}
                              title="Click to toggle between Ingredient and Product"
                            >
                              {item.isIngredient ? 'Ingredient' : 'Product'}
                            </button>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              className="cell-input qty"
                              value={item.quantity}
                              onChange={e => handleUpdateLineField(idx, 'quantity', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="cell-input uom"
                              value={item.unitOfMeasure}
                              onChange={e => handleUpdateLineField(idx, 'unitOfMeasure', e.target.value)}
                            />
                          </td>
                          <td>
                            <div className="cost-input-wrapper">
                              <span className="sym">{currencySymbol}</span>
                              <input
                                type="number"
                                step="any"
                                className="cell-input cost"
                                value={item.unitPrice}
                                onChange={e => handleUpdateLineField(idx, 'unitPrice', e.target.value)}
                              />
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              className="cell-input tax"
                              value={item.taxRate}
                              onChange={e => handleUpdateLineField(idx, 'taxRate', e.target.value)}
                            />
                          </td>
                          <td>
                            <span className="cell-total">{currencySymbol}{Number(item.lineTotal || 0).toFixed(currencyDecimals)}</span>
                          </td>
                          <td>
                            <button className="delete-row-btn" onClick={() => handleDeleteLine(idx)}>
                              <FaTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Card Stack */}
                <div className="mobile-card-stack">
                  {billItems.map((item, idx) => (
                    <div key={item.id} className={`mobile-item-card ${!item.selected ? 'card-deselected' : ''}`}>
                      <div className="card-top-row">
                        <label className="card-select-label">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleLine(idx)}
                          />
                          <span className="card-select-text">Include in Order</span>
                        </label>
                        <div className="card-top-actions">
                          <button
                            type="button"
                            className={`type-pill ${item.isIngredient ? 'ingredient' : 'product'}`}
                            onClick={() => handleToggleIngredient(idx)}
                            title="Toggle Ingredient / Product"
                          >
                            {item.isIngredient ? 'Ingredient' : 'Product'}
                          </button>
                          <button className="delete-row-btn" onClick={() => handleDeleteLine(idx)} title="Delete row">
                            <FaTrash />
                          </button>
                        </div>
                      </div>

                      {/* Mobile Editable Item Name */}
                      <div className="card-field-full">
                        <label>Product Name <span className="edit-hint">(Tap to edit)</span></label>
                        <input
                          type="text"
                          className="cell-input item-name-input"
                          value={item.productName ?? item.billName ?? ''}
                          onChange={e => handleUpdateItemName(idx, e.target.value)}
                          placeholder="Enter product name..."
                        />
                        <div className="item-sub-meta">
                          {item.rawName && item.rawName !== (item.productName || item.billName) && (
                            <span className="raw-bill-badge" title={`Original text on bill: ${item.rawName}`}>
                              Bill: {item.rawName}
                            </span>
                          )}
                          {item.confidence === 'HIGH' && <span className="match-tag high">High Match</span>}
                          {item.confidence === 'MEDIUM' && <span className="match-tag medium">Fuzzy Match</span>}
                          {item.confidence === 'NEW' && <span className="match-tag new">New Item</span>}
                        </div>
                      </div>

                      <div className="card-mapping-field">
                        <label>Maps To:</label>
                        <NiceSelect
                          options={productOptions}
                          value={item.productId}
                          onChange={(val) => handleProductMappingChange(idx, val)}
                          maxHeight={200}
                        />
                      </div>

                      <div className="card-grid-inputs">
                        <div className="card-field">
                          <label>Qty</label>
                          <input
                            type="number"
                            step="any"
                            className="cell-input"
                            value={item.quantity}
                            onChange={e => handleUpdateLineField(idx, 'quantity', e.target.value)}
                          />
                        </div>
                        <div className="card-field">
                          <label>Unit</label>
                          <input
                            type="text"
                            className="cell-input"
                            value={item.unitOfMeasure}
                            onChange={e => handleUpdateLineField(idx, 'unitOfMeasure', e.target.value)}
                          />
                        </div>
                        <div className="card-field">
                          <label>Cost Price</label>
                          <div className="cost-input-wrapper">
                            <span className="sym">{currencySymbol}</span>
                            <input
                              type="number"
                              step="any"
                              className="cell-input"
                              value={item.unitPrice}
                              onChange={e => handleUpdateLineField(idx, 'unitPrice', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="card-field">
                          <label>Total</label>
                          <span className="mobile-total-display">{currencySymbol}{Number(item.lineTotal || 0).toFixed(currencyDecimals)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary Comparison */}
              <div className="totals-reconciliation-bar">
                <div className="totals-col">
                  <span className="sub-label">Bill Subtotal:</span>
                  <span className="sub-val">{currencySymbol}{calculatedTotals.subtotal.toFixed(currencyDecimals)}</span>
                </div>
                <div className="totals-col">
                  <span className="sub-label">Tax Total:</span>
                  <span className="sub-val">{currencySymbol}{calculatedTotals.taxTotal.toFixed(currencyDecimals)}</span>
                </div>
                <div className="totals-col grand">
                  <span className="sub-label">Order Grand Total:</span>
                  <span className="sub-val-grand">{currencySymbol}{calculatedTotals.grandTotal.toFixed(currencyDecimals)}</span>
                </div>
                {rawBillTotals.grandTotal > 0 && (
                  <div className="bill-detected-compare">
                    <span>Detected on Bill: <strong>{currencySymbol}{rawBillTotals.grandTotal.toFixed(currencyDecimals)}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="modal-footer">
          {step === 'review' && (
            <>
              <button
                type="button"
                className="btn-footer-back"
                onClick={() => setStep('upload')}
              >
                Scan Another
              </button>
              <div className="footer-action-group">
                <button
                  type="button"
                  className="btn-footer-apply"
                  onClick={handleApplyToPurchaseOrder}
                >
                  <FaArrowRight /> Load into Purchase Order
                </button>
                <button
                  type="button"
                  className="btn-footer-direct"
                  onClick={handleDirectComplete}
                >
                  <FaCheckCircle /> Complete & Receive Stock
                </button>
              </div>
            </>
          )}

          {step === 'saving' && (
            <div className="saving-status">
              <FaSpinner className="spinner-icon" /> Creating purchase order & updating stock...
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .bill-scan-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          animation: fadeIn 0.2s ease-out;
        }

        .bill-scan-modal {
          background: #ffffff;
          width: 100%;
          max-width: 1100px;
          height: 92vh;
          max-height: 92vh;
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }

        @media (max-width: 768px) {
          .bill-scan-overlay {
            padding: 0;
          }
          .bill-scan-modal {
            max-width: 100%;
            height: 100dvh;
            max-height: 100dvh;
            border-radius: 0;
            padding-top: env(safe-area-inset-top, 0);
            padding-bottom: env(safe-area-inset-bottom, 0);
          }
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #f1f5f9;
          background: #ffffff;
        }

        .header-title-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ai-badge-icon {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);
          color: #ffffff;
          padding: 6px 12px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 13px;
          box-shadow: 0 4px 12px rgba(234, 88, 12, 0.3);
        }

        .header-title-box h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }

        .header-sub {
          margin: 2px 0 0 0;
          font-size: 12px;
          color: #64748b;
        }

        .close-btn {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #64748b;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #fee2e2;
          color: #ef4444;
          border-color: #fca5a5;
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
          background: #f8fafc;
        }

        @media (max-width: 768px) {
          .modal-header {
            padding: 12px 16px;
          }
          .modal-body {
            padding: 14px 12px;
          }
        }

        .scan-alert-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          border-radius: 12px;
          margin-bottom: 16px;
          font-size: 13px;
          font-weight: 600;
        }

        /* Upload Step */
        .upload-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 340px;
          padding: 20px 0;
        }

        .upload-dropzone {
          border: 2px dashed #cbd5e1;
          border-radius: 20px;
          padding: 40px 24px;
          text-align: center;
          background: #ffffff;
          width: 100%;
          max-width: 650px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .upload-dropzone:hover {
          border-color: #f97316;
          background: #fffaf5;
        }

        .dropzone-icon-ring {
          width: 70px;
          height: 70px;
          margin: 0 auto 16px auto;
          border-radius: 50%;
          background: #ffedd5;
          color: #ea580c;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
        }

        .upload-dropzone h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          color: #1e293b;
        }

        .upload-dropzone p {
          margin: 0 0 24px 0;
          font-size: 13px;
          color: #64748b;
          max-width: 480px;
          margin-left: auto;
          margin-right: auto;
        }

        .upload-actions {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .action-btn {
          border: none;
          padding: 12px 24px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .action-btn:active {
          transform: scale(0.98);
        }

        .action-btn.camera {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(234, 88, 12, 0.35);
        }

        .action-btn.gallery {
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #cbd5e1;
        }

        .preview-container {
          width: 100%;
          max-width: 650px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .preview-media-box {
          width: 100%;
          max-height: 400px;
          overflow: hidden;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .preview-media-box img {
          max-width: 100%;
          max-height: 400px;
          object-fit: contain;
        }

        .preview-toolbar {
          display: flex;
          gap: 12px;
          width: 100%;
          justify-content: flex-end;
        }

        .toolbar-btn {
          padding: 12px 20px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          border: none;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toolbar-btn.primary {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: #fff;
          box-shadow: 0 4px 14px rgba(234, 88, 12, 0.3);
        }

        .toolbar-btn.secondary {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
        }

        /* Scanning State */
        .scanning-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 380px;
          gap: 24px;
        }

        .scanner-animation-box {
          position: relative;
          width: 260px;
          height: 320px;
          border-radius: 16px;
          overflow: hidden;
          border: 2px solid #f97316;
          box-shadow: 0 8px 30px rgba(249, 115, 22, 0.25);
          background: #0f172a;
        }

        .scanning-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.6;
        }

        .scanner-laser-line {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, rgba(249, 115, 22, 0) 0%, #f97316 50%, rgba(249, 115, 22, 0) 100%);
          box-shadow: 0 0 16px #f97316;
          animation: scanLaser 2s infinite ease-in-out;
        }

        @keyframes scanLaser {
          0% { top: 0%; }
          50% { top: 98%; }
          100% { top: 0%; }
        }

        .scanning-status-box {
          text-align: center;
        }

        .spinner-icon {
          animation: spin 1s infinite linear;
          font-size: 24px;
          color: #f97316;
          margin-bottom: 8px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .scanning-status-box h3 {
          margin: 0 0 6px 0;
          font-size: 17px;
          color: #0f172a;
        }

        .scanning-status-box p {
          margin: 0;
          font-size: 13px;
          color: #64748b;
        }

        /* Review Step */
        .bill-header-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          background: #ffffff;
          padding: 16px;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          margin-bottom: 16px;
        }

        .header-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .header-field label {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .header-field label .req {
          color: #ef4444;
        }

        .field-hint-ai {
          font-size: 11px;
          color: #ea580c;
          font-weight: 600;
        }

        .text-input {
          height: 38px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 13px;
          color: #0f172a;
          background: #ffffff;
          outline: none;
        }

        .text-input:focus {
          border-color: #f97316;
        }

        .items-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .items-header-bar h4 {
          margin: 0 0 2px 0;
          font-size: 15px;
          color: #0f172a;
          font-weight: 700;
        }

        .items-header-bar p {
          margin: 0;
          font-size: 12px;
          color: #64748b;
        }

        .add-line-btn {
          background: #ffffff;
          border: 1px dashed #cbd5e1;
          color: #f97316;
          font-weight: 700;
          font-size: 12px;
          padding: 6px 14px;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .add-line-btn:hover {
          background: #fff7ed;
          border-color: #f97316;
        }

        /* Items Container & Table (Desktop) */
        .items-container {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          margin-bottom: 16px;
        }

        .desktop-table-wrapper {
          display: block;
          overflow-x: auto;
          max-height: 400px;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 13px;
        }

        .items-table th {
          background: #f8fafc;
          color: #475569;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          position: sticky;
          top: 0;
          z-index: 2;
        }

        .items-table td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }

        .row-deselected {
          opacity: 0.45;
          background: #fafafa;
        }

        .checkbox-input {
          width: 18px;
          height: 18px;
          accent-color: #ea580c;
          cursor: pointer;
        }

        .item-name-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 220px;
        }

        .item-name-input {
          font-weight: 700 !important;
          color: #0f172a !important;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 6px 10px;
          height: 34px;
          width: 100%;
          font-size: 13px;
          transition: all 0.15s ease;
        }

        .item-name-input:hover {
          border-color: #94a3b8;
        }

        .item-name-input:focus {
          border-color: #ea580c;
          box-shadow: 0 0 0 2px rgba(234, 88, 12, 0.15);
          outline: none;
        }

        .item-sub-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .raw-bill-badge {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .match-tag {
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 6px;
          width: fit-content;
        }

        .match-tag.high {
          background: #dcfce7;
          color: #15803d;
        }

        .match-tag.medium {
          background: #fef9c3;
          color: #854d0e;
        }

        .match-tag.new {
          background: #e0e7ff;
          color: #4338ca;
        }

        /* Type Pill (Ingredient vs Product) */
        .type-pill {
          border: none;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          transition: transform 0.1s;
        }

        .type-pill:active {
          transform: scale(0.95);
        }

        .type-pill.ingredient {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }

        .type-pill.product {
          background: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }

        .cell-input {
          height: 32px;
          padding: 0 8px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          outline: none;
          width: 100%;
        }

        .cell-input:focus {
          border-color: #f97316;
        }

        .cost-input-wrapper {
          display: flex;
          align-items: center;
          position: relative;
        }

        .cost-input-wrapper .sym {
          position: absolute;
          left: 8px;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }

        .cost-input-wrapper .cell-input.cost {
          padding-left: 20px;
        }

        .cell-total {
          font-weight: 700;
          color: #0f172a;
        }

        .delete-row-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 14px;
          padding: 6px;
          border-radius: 6px;
        }

        .delete-row-btn:hover {
          color: #ef4444;
          background: #fee2e2;
        }

        /* Mobile Card Stack (Hidden on Desktop) */
        .mobile-card-stack {
          display: none;
        }

        @media (max-width: 768px) {
          .desktop-table-wrapper {
            display: none;
          }
          .mobile-card-stack {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px;
            max-height: 50vh;
            overflow-y: auto;
          }

          .mobile-item-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .card-deselected {
            opacity: 0.5;
            background: #f8fafc;
          }

          .card-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .card-select-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }

          .card-select-text {
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
          }

          .card-field-full {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .card-field-full label {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .card-field-full label .edit-hint {
            font-size: 10px;
            color: #ea580c;
            text-transform: none;
            font-weight: 600;
          }

          .card-top-actions {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .card-mapping-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .card-mapping-field label {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
          }

          .card-grid-inputs {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            align-items: flex-end;
          }

          .card-field {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .card-field label {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
          }

          .mobile-total-display {
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            height: 32px;
            display: flex;
            align-items: center;
          }
        }

        /* Totals Reconciliation Bar */
        .totals-reconciliation-bar {
          background: #ffffff;
          padding: 14px 20px;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }

        .totals-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .sub-label {
          font-size: 11px;
          color: #64748b;
          font-weight: 700;
          text-transform: uppercase;
        }

        .sub-val {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
        }

        .totals-col.grand .sub-val-grand {
          font-size: 18px;
          font-weight: 900;
          color: #ea580c;
        }

        .bill-detected-compare {
          margin-left: auto;
          font-size: 12px;
          color: #64748b;
          background: #f1f5f9;
          padding: 6px 12px;
          border-radius: 8px;
        }

        @media (max-width: 768px) {
          .totals-reconciliation-bar {
            padding: 10px 12px;
            gap: 12px;
          }
          .bill-detected-compare {
            margin-left: 0;
            width: 100%;
          }
        }

        /* Modal Footer */
        .modal-footer {
          padding: 14px 24px;
          border-top: 1px solid #f1f5f9;
          background: #ffffff;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .footer-action-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .btn-footer-back {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-weight: 700;
          font-size: 13px;
          padding: 10px 16px;
          border-radius: 12px;
          cursor: pointer;
        }

        .btn-footer-apply {
          background: #0f172a;
          color: #ffffff;
          border: none;
          font-weight: 700;
          font-size: 13px;
          padding: 10px 18px;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-footer-direct {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          color: #ffffff;
          border: none;
          font-weight: 700;
          font-size: 13px;
          padding: 10px 18px;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 14px rgba(5, 150, 105, 0.3);
        }

        .saving-status {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ea580c;
          font-weight: 700;
          font-size: 14px;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
