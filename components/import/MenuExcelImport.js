import React, { useState, useRef } from 'react';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';
import { FaFileExcel, FaExclamationCircle, FaTrash, FaCheckCircle, FaUpload } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import api from '../../utils/api';
import CafeQRPopup from '../CafeQRPopup';

const cleanStr = (val, fallback = '') => String(val ?? fallback).trim();
const toNum = (val) => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export default function MenuExcelImport({ onClose, onImported, uoms = [], categories = [] }) {
  const currencySymbol = useCurrencySymbol();
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [step, setStep] = useState('upload'); // upload, review, importing
  const [error, setError] = useState(null);
  const fileInputRef = useRef();

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      parseExcel(f);
    }
  };

  const parseExcel = async (uploadedFile) => {
    setError(null);
    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        throw new Error('The selected workbook contains no readable sheets.');
      }

      // Convert sheet to 2D array of rows to intelligently detect the header row
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rawRows || rawRows.length === 0) {
        throw new Error('The selected sheet is completely empty.');
      }

      const KEYWORD_INDICATORS = [
        'particulars', 'description of goods', 'item description', 'description',
        'item', 'product', 'name', 'title', 'commodity',
        'hsn', 'hsn code', 'hsn/sac', 'sac',
        'tax %', 'gst %', 'tax', 'gst', 'cgst', 'sgst',
        'rate', 'price', 'mrp', 'amount', 'total value', 'taxable amount', 'val'
      ];

      // Detect header row index (scanning first 15 rows)
      let headerRowIndex = 0;
      let maxScore = 0;
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        const rowCells = (rawRows[r] || []).map((c) => String(c).toLowerCase().trim());
        let score = 0;
        rowCells.forEach((cell) => {
          if (cell && KEYWORD_INDICATORS.some((kw) => cell.includes(kw))) {
            score++;
          }
        });
        if (score > maxScore) {
          maxScore = score;
          headerRowIndex = r;
        }
      }

      // Read JSON using detected header row
      const json = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' });
      if (json.length === 0) {
        throw new Error('Could not find any data rows under the detected header in this file.');
      }

      const mapped = json.map((row) => {
        const keys = Object.keys(row);
        const findVal = (candidates) => {
          const key = keys.find((k) => {
            const cleanKey = String(k || '').trim().toLowerCase();
            return candidates.some((c) => cleanKey === c || cleanKey.includes(c));
          });
          return key !== undefined ? row[key] : null;
        };

        const nameVal = findVal([
          'particulars', 'description of goods', 'item description',
          'commodity', 'item name', 'product name', 'product', 'item', 'name', 'title'
        ]);

        if (!nameVal || !cleanStr(nameVal)) {
          return null;
        }

        // Price extraction
        const totalValue = toNum(findVal(['total value', 'total amount', 'net amount', 'total', 'val']));
        const priceVal = toNum(findVal(['selling price', 'sale price', 'mrp', 'rate', 'price', 'amount']));
        const taxableVal = toNum(findVal(['taxable amount', 'taxable value', 'basic rate', 'basic amount', 'cost price', 'cost']));

        const finalPrice = totalValue > 0 ? totalValue : (priceVal > 0 ? priceVal : (taxableVal > 0 ? taxableVal : 0));
        const costPrice = taxableVal > 0 ? taxableVal : (priceVal > 0 && totalValue > 0 ? priceVal : 0);

        // HSN Code
        const hsnVal = cleanStr(findVal(['hsn code', 'hsn/sac', 'hsn', 'sac code', 'sac', 'tax code']));

        // Tax % extraction
        const directTax = toNum(findVal(['tax %', 'tax percent', 'tax rate', 'gst %', 'gst rate', 'total gst %', 'tax', 'gst']));
        const cgst = toNum(findVal(['cgst %', 'cgst rate', 'cgst']));
        const sgst = toNum(findVal(['sgst %', 'sgst rate', 'sgst']));
        const totalGstVal = toNum(findVal(['total gst', 'gst amount', 'tax amount']));

        let taxRate = directTax;
        if (!taxRate && (cgst > 0 || sgst > 0)) {
          taxRate = cgst + sgst;
        }
        if (!taxRate && taxableVal > 0 && totalGstVal > 0) {
          taxRate = Math.round((totalGstVal / taxableVal) * 100);
        }

        // Packaged good detection
        const isPackagedGood = Boolean(hsnVal || taxRate > 0 || totalValue > 0);

        // SKU / Product Code
        const productCode = cleanStr(findVal(['code', 'item code', 'product code', 'sku', 'barcode', 'part no', 'model']));

        // Category & UOM
        const category = cleanStr(findVal(['category', 'group', 'type', 'cat', 'dept', 'department']), 'General') || 'General';
        const uom = cleanStr(findVal(['unit', 'uom', 'unit of measure', 'qty unit', 'measure']), 'Each') || 'Each';
        const description = cleanStr(findVal(['description', 'desc', 'summary', 'detail']));

        return {
          name: cleanStr(nameVal),
          price: finalPrice,
          costPrice,
          mrp: totalValue > 0 ? totalValue : finalPrice,
          hsnCode: hsnVal,
          taxRate,
          isPackagedGood,
          productCode,
          category,
          uom,
          description,
          selected: true,
        };
      }).filter(Boolean);

      if (mapped.length === 0) {
        throw new Error('Could not find any products in the file. Please ensure columns like "Particulars", "Name", or "Item" are present.');
      }

      setItems(mapped);
      setStep('review');
    } catch (err) {
      setError(err.message || 'Failed to parse Excel file');
      setFile(null);
    }
  };

  const handleImport = async () => {
    const selectedItems = items.filter((it) => it.selected);
    if (selectedItems.length === 0) return;

    setStep('importing');
    try {
      const payload = selectedItems.map((it) => ({
        name: cleanStr(it.name),
        price: toNum(it.price),
        costPrice: toNum(it.costPrice) > 0 ? toNum(it.costPrice) : null,
        mrp: toNum(it.mrp) > 0 ? toNum(it.mrp) : toNum(it.price),
        taxCode: cleanStr(it.hsnCode) || null,
        taxRate: toNum(it.taxRate),
        productCode: cleanStr(it.productCode) || null,
        uom: it.uom ? { name: cleanStr(it.uom) } : null,
        category: { name: cleanStr(it.category, 'General') || 'General' },
        description: cleanStr(it.description),
        isPackagedGood: Boolean(it.isPackagedGood),
        productType: it.isPackagedGood ? 'GENERAL' : 'NON_VEG',
        isAvailable: true,
        isActive: true,
        isIngredient: false,
      }));

      const res = await api.post('/api/v1/products/bulk', payload);
      if (res.data?.success) {
        onImported(res.data.data);
        onClose();
      } else {
        throw new Error(res.data?.message || 'Failed to import products');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to import products';
      setError(msg);
      setStep('review');
    }
  };

  const updateItemField = (idx, field, value) => {
    const updated = [...items];
    if (field === 'price' || field === 'costPrice' || field === 'taxRate') {
      updated[idx][field] = value === '' ? '' : parseFloat(value) || 0;
    } else if (field === 'isPackagedGood') {
      updated[idx][field] = Boolean(value);
    } else {
      updated[idx][field] = value;
    }
    setItems(updated);
  };

  const toggleItem = (idx) => {
    const updated = [...items];
    updated[idx].selected = !updated[idx].selected;
    setItems(updated);
  };

  const handleMarkAllPackaged = (status) => {
    setItems((prev) => prev.map((it) => ({ ...it, isPackagedGood: status })));
  };

  const handleBulkSetTaxRate = (rate) => {
    if (rate === '') return;
    const num = toNum(rate);
    setItems((prev) => prev.map((it) => ({ ...it, taxRate: num })));
  };

  return (
    <CafeQRPopup
      title="Excel/CSV Product Import"
      onClose={onClose}
      onSave={step === 'review' ? handleImport : null}
      saveLabel={`Complete Import (${items.filter((it) => it.selected).length})`}
      isSaving={step === 'importing'}
      icon={FaFileExcel}
    >
      <div className="import-body-content">
        {error && (
          <div className="import-error">
            <FaExclamationCircle /> {error}
          </div>
        )}

        {step === 'upload' && (
          <div className="upload-section">
            <div className="drop-zone" onClick={() => fileInputRef.current.click()}>
              <FaUpload className="drop-icon" />
              <p>Click to upload Excel (.xlsx, .xls) or CSV file</p>
              <span>Supports GST invoices, price lists & inventory sheets with &quot;Particulars&quot;, &quot;HSN&quot;, &quot;Price&quot;</span>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls,.csv" hidden />
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="review-section">
            <div className="review-header">
              <div className="review-header-left">
                <strong>{items.filter((i) => i.selected).length}</strong> items detected for import
              </div>
              <div className="review-header-tools">
                <button
                  type="button"
                  className="batch-tool-btn"
                  onClick={() => handleMarkAllPackaged(true)}
                  title="Mark all as packaged retail goods"
                >
                  📦 All Packaged
                </button>
                <button
                  type="button"
                  className="batch-tool-btn"
                  onClick={() => handleMarkAllPackaged(false)}
                  title="Mark all as standard food items"
                >
                  🍽️ All Food
                </button>
                <select
                  className="batch-select"
                  defaultValue=""
                  onChange={(e) => {
                    handleBulkSetTaxRate(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="" disabled>Set Tax Rate...</option>
                  <option value="0">0% (Nil)</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST</option>
                  <option value="28">28% GST</option>
                </select>
              </div>
            </div>

            <div className="items-list">
              {items.map((it, idx) => (
                <div key={idx} className={`review-item ${!it.selected ? 'disabled' : ''}`}>
                  <div className="item-checkbox" onClick={() => toggleItem(idx)}>
                    {it.selected ? <FaCheckCircle className="checked" /> : <div className="unchecked" />}
                  </div>
                  <div className="item-fields">
                    {/* Row 1: Name, SKU, Price */}
                    <div className="field-row">
                      <input
                        className="name-input"
                        value={it.name}
                        onChange={(e) => updateItemField(idx, 'name', e.target.value)}
                        placeholder="Product Name"
                      />
                      <input
                        className="code-input"
                        value={it.productCode || ''}
                        onChange={(e) => updateItemField(idx, 'productCode', e.target.value)}
                        placeholder="SKU / Model"
                        title="Item Code / SKU"
                      />
                      <div className="price-input-wrap" title="Selling Price (Total Value / Tax Inclusive)">
                        <span>{currencySymbol}</span>
                        <input
                          type="number"
                          value={it.price}
                          onChange={(e) => updateItemField(idx, 'price', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Row 2: Packaged Toggle, HSN, Tax %, UOM, Taxable Hint */}
                    <div className="field-row tax-row">
                      <button
                        type="button"
                        className={`packaged-toggle-btn ${it.isPackagedGood ? 'active' : ''}`}
                        onClick={() => updateItemField(idx, 'isPackagedGood', !it.isPackagedGood)}
                        title="Toggle Packaged Good status (enables Barcode & HSN)"
                      >
                        {it.isPackagedGood ? '📦 Packaged' : '🍽️ Food/Dish'}
                      </button>
                      <input
                        className="hsn-input"
                        value={it.hsnCode || ''}
                        onChange={(e) => updateItemField(idx, 'hsnCode', e.target.value)}
                        placeholder="HSN Code (e.g. 85444999)"
                        title="HSN / SAC Code"
                      />
                      <div className="tax-rate-wrap" title="GST Percentage (e.g. 18)">
                        <input
                          type="number"
                          className="tax-rate-input"
                          value={it.taxRate !== undefined && it.taxRate !== null ? it.taxRate : ''}
                          onChange={(e) => updateItemField(idx, 'taxRate', e.target.value)}
                          placeholder="0"
                        />
                        <span>% GST</span>
                      </div>
                      <input
                        className="uom-input"
                        value={it.uom || 'Each'}
                        onChange={(e) => updateItemField(idx, 'uom', e.target.value)}
                        placeholder="Unit (Pcs)"
                        title="Unit of Measurement (UOM)"
                      />
                      {it.costPrice > 0 && (
                        <div className="cost-tag" title="Taxable / Purchase Base Rate">
                          Taxable: {currencySymbol}{it.costPrice}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Category & Description */}
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
                  <button
                    className="item-delete"
                    onClick={() => {
                      const updated = items.filter((_, i) => i !== idx);
                      setItems(updated);
                    }}
                  >
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
            <h4>Importing products to catalog...</h4>
          </div>
        )}
      </div>

      <style jsx>{`
        .upload-section { min-height: 250px; display: flex; flex-direction: column; }
        .drop-zone {
          flex: 1; border: 2px dashed #e2e8f0; border-radius: 20px; display: flex; flex-direction: column; align-items: center; 
          justify-content: center; gap: 12px; cursor: pointer; transition: 0.2s; padding: 40px; text-align: center;
        }
        .drop-zone:hover { border-color: #f97316; background: #fff7ed; }
        .drop-icon { font-size: 48px; color: #cbd5e1; }
        .drop-zone p { margin: 0; font-size: 15px; font-weight: 700; color: #334155; }
        .drop-zone span { font-size: 12px; color: #94a3b8; font-weight: 600; }

        .review-section { display: flex; flex-direction: column; gap: 16px; }
        .review-header { 
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
          font-size: 13px; font-weight: 700; color: #64748b; background: #f8fafc; padding: 10px 16px; border-radius: 10px; border: 1px solid #e2e8f0;
        }
        .review-header-left { display: flex; align-items: center; gap: 6px; }
        .review-header-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .batch-tool-btn { 
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: #475569; cursor: pointer; transition: 0.2s;
        }
        .batch-tool-btn:hover { background: #fff7ed; border-color: #f97316; color: #ea580c; }
        .batch-select {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700; color: #475569; outline: none; cursor: pointer;
        }
        .batch-select:focus { border-color: #f97316; }

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
        .field-row.tax-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

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
        .code-input { width: 120px; font-weight: 700; border: 1px solid #e2e8f0; outline: none; padding: 8px 10px; border-radius: 8px; font-size: 13px; background: #ffffff; }

        .price-input-wrap { display: flex; align-items: center; gap: 4px; background: #ffffff; padding: 8px 10px; border-radius: 8px; width: 120px; border: 1px solid #e2e8f0; }
        .price-input-wrap span { font-weight: 800; color: #64748b; }
        .price-input-wrap input { border: none; background: none; font-weight: 800; font-size: 14px; width: 100%; outline: none; }
        
        .packaged-toggle-btn {
          border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; transition: 0.2s; white-space: nowrap;
        }
        .packaged-toggle-btn.active {
          background: #fff7ed; border-color: #fdba74; color: #ea580c;
        }
        .hsn-input {
          width: 140px; border: 1px solid #e2e8f0; background: #ffffff; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; outline: none;
        }
        .tax-rate-wrap {
          display: flex; align-items: center; gap: 4px; border: 1px solid #e2e8f0; background: #ffffff; border-radius: 8px; padding: 6px 10px; width: 95px;
        }
        .tax-rate-input {
          border: none; background: transparent; font-size: 12px; font-weight: 800; width: 100%; outline: none;
        }
        .tax-rate-wrap span { font-size: 11px; font-weight: 700; color: #94a3b8; white-space: nowrap; }
        .uom-input {
          width: 80px; border: 1px solid #e2e8f0; background: #ffffff; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; outline: none;
        }
        .cost-tag {
          font-size: 11px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; white-space: nowrap;
        }

        .cat-input, .desc-input { border: 1px solid #e2e8f0; background: #ffffff; padding: 8px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; outline: none; }
        .cat-input { width: 140px; color: #f97316; }
        .desc-input { flex: 1; color: #334155; min-width: 0; }
        .cat-input:focus, .desc-input:focus { border-color: #e2e8f0; background: white; }

        .item-delete { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 8px; font-size: 14px; border-radius: 8px; }
        .item-delete:hover { color: #ef4444; background: #fef2f2; }

        .processing-state { text-align: center; padding: 40px 0; }
        .simple-loader { width: 32px; height: 32px; border: 3px solid #f1f5f9; border-top-color: #f97316; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 24px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .processing-state h4 { margin: 0 0 8px; font-size: 18px; font-weight: 800; color: #0f172a; }

        .import-error { background: #fef2f2; color: #b91c1c; padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        @media (max-width: 640px) {
          .review-item { gap: 10px; padding: 12px; }
          .field-row, .field-row.secondary, .field-row.tax-row { grid-template-columns: 1fr; display: grid; }
          .price-input-wrap, .cat-input, .code-input, .hsn-input, .uom-input { width: 100%; }
        }
      `}</style>
    </CafeQRPopup>
  );
}
