import React, { useState, useEffect } from 'react';
import CafeQRPopup from '../CafeQRPopup';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { FaPrint } from 'react-icons/fa';
import { generateStockTransferPdf } from '../../utils/stockTransferPdf';

export default function StockDocumentViewerPopup({
  doc,
  docType: propDocType,
  warehouses: initialWarehouses = [],
  products: initialProducts = [],
  timezone,
  formatTzDate,
  onClose,
  onConfirmTransfer = null
}) {
  const auth = useAuth() || {};
  const { firstName, lastName, email: authEmail, userId: authUserId, userRole } = auth;
  const currentLoggedInName = [firstName, lastName].filter(Boolean).join(" ") || authEmail || (userRole ? `${userRole} Staff` : "Staff User");

  const [currentDoc, setCurrentDoc] = useState(doc);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [products, setProducts] = useState(initialProducts);
  const [warehousesList, setWarehousesList] = useState(initialWarehouses);
  const [orgsList, setOrgsList] = useState([]);
  const [usersList, setUsersList] = useState([]);

  const isTransfer = propDocType === 'stock_transfer' || !!(currentDoc?.sourceWarehouseId || currentDoc?.source_warehouse_id || currentDoc?.destWarehouseId);

  useEffect(() => {
    setCurrentDoc(doc);
    const docId = doc?.id;

    // Fetch full document details from backend to get populated createdByName, updatedByName & lines
    if (docId) {
      setLoading(true);
      const endpoint = isTransfer 
        ? `/api/v1/inventory/transfers/${docId}` 
        : `/api/v1/inventory/adjustments/${docId}`;
        
      api.get(endpoint)
        .then(res => {
          if (res.data?.data) {
            setCurrentDoc(res.data.data);
          }
        })
        .catch(err => {
          console.warn("Failed to fetch full stock document details:", err);
        })
        .finally(() => setLoading(false));
    }
  }, [doc?.id, isTransfer]);

  // Load warehouses if not passed or incomplete
  useEffect(() => {
    api.get('/api/v1/warehouses')
      .then(res => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setWarehousesList(res.data.data);
        }
      })
      .catch(() => {});
  }, []);

  // Load organizations to display org name in brackets
  useEffect(() => {
    api.get('/api/v1/organizations')
      .then(res => {
        const oList = res.data?.data || res.data || [];
        if (Array.isArray(oList)) setOrgsList(oList);
      })
      .catch(() => {});
  }, []);

  // Ensure products list is available for product lookup
  useEffect(() => {
    if (!products || products.length === 0) {
      api.get('/api/v1/products')
        .then(res => {
          if (res.data?.success) {
            setProducts(res.data.data || []);
          }
        })
        .catch(() => {});
    }
  }, [products]);

  // Load user directory for user resolution
  useEffect(() => {
    api.get('/api/v1/users')
      .then(res => {
        const uList = res.data?.data || res.data || [];
        if (Array.isArray(uList)) setUsersList(uList);
      })
      .catch(() => {});
  }, []);

  if (!currentDoc) return null;

  const getWhLabel = (id) => {
    if (!id) return '—';
    const idStr = String(id);
    const w = warehousesList.find(x => String(x.id) === idStr);
    if (!w) return '—';
    const wName = w.name || 'Warehouse';
    const oId = w.orgId || w.organizationId || w.org_id || w.organization_id;
    const org = orgsList.find(o => String(o.id) === String(oId));
    const oName = org?.name || w.orgName || w.organizationName;
    return oName ? `${wName} (${oName})` : wName;
  };

  const getProduct = (id) => products.find(p => String(p.id) === String(id));

  const docNumber = currentDoc.transferNumber || currentDoc.adjustmentNumber || currentDoc.id || '—';
  const docDate = currentDoc.transferDate || currentDoc.adjustmentDate || currentDoc.createdAt;
  const status = (currentDoc.status || 'DRAFT').toUpperCase();

  const sourceWhLabel = getWhLabel(currentDoc.sourceWarehouseId || currentDoc.source_warehouse_id);
  const destWhLabel = getWhLabel(currentDoc.destWarehouseId || currentDoc.dest_warehouse_id);
  const mainWhLabel = getWhLabel(currentDoc.warehouseId || currentDoc.warehouse_id);

  // Formatting user display names
  const resolveUserName = (rawName, rawId) => {
    if (rawName && !rawName.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/)) {
      return rawName;
    }
    if (rawId) {
      const rawIdStr = String(rawId);
      if (authUserId && String(authUserId) === rawIdStr) {
        return currentLoggedInName;
      }
      const found = usersList.find(u => String(u.id) === rawIdStr);
      if (found) {
        const nameStr = [found.firstName, found.lastName].filter(Boolean).join(" ");
        if (nameStr) return nameStr;
        if (found.email) return found.email;
        if (found.username) return found.username;
      }
    }
    return currentLoggedInName;
  };

  const createdByDisplay = resolveUserName(currentDoc.createdByName, currentDoc.createdBy);
  const updatedByDisplay = resolveUserName(currentDoc.updatedByName, currentDoc.updatedBy);

  // Status configuration
  const statusConfig = {
    'COMPLETED': { label: 'Confirmed / Completed', bg: '#dcfce7', color: '#15803d' },
    'IN_TRANSIT': { label: 'In Transit', bg: '#ffedd5', color: '#ea580c' },
    'DRAFT': { label: 'Draft', bg: '#f1f5f9', color: '#475569' },
    'CANCELLED': { label: 'Cancelled', bg: '#fef2f2', color: '#dc2626' }
  };
  const activeStatus = statusConfig[status] || statusConfig['DRAFT'];

  const lines = currentDoc.lines || currentDoc.items || currentDoc.adjustmentLines || currentDoc.transferLines || [];


  // Date & Time formatting
  const formattedDateStr = (() => {
    if (!docDate) return { date: '—', time: '' };
    if (formatTzDate) {
      const d = formatTzDate(docDate, timezone, { format: 'date' });
      const t = formatTzDate(docDate, timezone, { format: 'time' });
      return { date: d || '—', time: t || '' };
    }
    try {
      const dt = new Date(docDate);
      return { date: dt.toLocaleDateString(), time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    } catch (e) {
      return { date: docDate, time: '' };
    }
  })();

  const handlePrint = () => {
    generateStockTransferPdf(currentDoc, warehousesList, products);
  };

  const handleConfirmAction = async () => {
    if (!onConfirmTransfer || confirming) return;
    setConfirming(true);
    try {
      await onConfirmTransfer(currentDoc);
      setCurrentDoc(prev => ({ 
        ...prev, 
        status: 'COMPLETED',
        updatedByName: currentLoggedInName,
        updatedBy: authUserId || prev.updatedBy
      }));
    } catch (err) {
      console.error("Failed to confirm transfer from popup:", err);
    } finally {
      setConfirming(false);
    }
  };

  // Calculate totals
  let totalQty = 0;
  let totalValue = 0;
  lines.forEach(l => {
    const q = Math.abs(Number(l.transferQuantity ?? l.quantityChange ?? l.quantity ?? 0));
    const cost = Number(l.unitCost ?? l.unit_cost ?? 0);
    totalQty += q;
    totalValue += (q * cost);
  });

  return (
    <CafeQRPopup
      title={docNumber}
      subtitle={isTransfer ? "STOCK TRANSFER" : "STOCK ADJUSTMENT"}
      badge={{
        label: activeStatus.label,
        color: activeStatus.color,
        bg: activeStatus.bg
      }}
      maxWidth="820px"
      onClose={onClose}
      hideFooter={true}
    >
      <div className="doc-viewer-content">
        {loading && (
          <div className="loading-banner">
            Loading document details...
          </div>
        )}

        {/* Row 1: Source & Destination Warehouses with Organization in brackets */}
        <div className="meta-row grid-2">
          {isTransfer ? (
            <>
              <div className="meta-col">
                <span className="col-label">SOURCE WAREHOUSE</span>
                <span className="col-value bold">{sourceWhLabel}</span>
              </div>
              <div className="meta-col">
                <span className="col-label">DESTINATION WAREHOUSE</span>
                <span className="col-value bold">{destWhLabel}</span>
              </div>
            </>
          ) : (
            <>
              <div className="meta-col">
                <span className="col-label">WAREHOUSE</span>
                <span className="col-value bold">{mainWhLabel}</span>
              </div>
              <div className="meta-col">
                <span className="col-label">REASON</span>
                <span className="col-value bold">{currentDoc.reason || '—'}</span>
              </div>
            </>
          )}
        </div>

        <div className="divider-line orange-accent" />

        {/* Row 2: Date & Notes */}
        <div className="meta-row grid-2">
          <div className="meta-col">
            <span className="col-label">DATE</span>
            <span className="col-value bold">{formattedDateStr.date}</span>
            {formattedDateStr.time && <span className="col-subtext">{formattedDateStr.time}</span>}
          </div>
          <div className="meta-col">
            <span className="col-label">NOTES / REMARKS</span>
            <span className="col-value">{currentDoc.notes || '—'}</span>
          </div>
        </div>

        <div className="divider-line orange-accent" />

        {/* Row 3: Created By & Last Updated By */}
        <div className="meta-row grid-2">
          <div className="meta-col">
            <span className="col-label">CREATED BY</span>
            <span className="col-value bold">{createdByDisplay}</span>
          </div>
          <div className="meta-col">
            <span className="col-label">LAST UPDATED BY</span>
            <span className="col-value bold">{updatedByDisplay}</span>
          </div>
        </div>

        <div className="divider-line orange-accent" />

        {/* Manifest Items Section */}
        <div className="items-section-header">
          <span className="section-label">MANIFEST ITEMS</span>
          <span className="count-pill orange">{lines.length}</span>
        </div>

        <div className="table-wrapper">
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>PRODUCT</th>
                <th style={{ textAlign: 'right' }}>QTY</th>
                <th style={{ textAlign: 'right' }}>UNIT COST</th>
                <th style={{ textAlign: 'right' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-cell">No items in this document.</td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  const p = getProduct(line.productId || line.product_id);
                  const prodName = line.productName || p?.name || line.product_name || `Product #${(idx + 1)}`;
                  const sku = line.sku || p?.productCode || p?.sku || p?.code || '—';
                  const category = line.categoryName || p?.categoryName || p?.category?.name || '—';
                  const unitCost = Number(line.unitCost ?? line.unit_cost ?? 0);
                  
                  const qty = isTransfer 
                    ? Number(line.transferQuantity ?? line.quantity ?? 0)
                    : Number(line.quantityChange ?? line.quantity_change ?? line.quantity ?? 0);

                  const lineTotal = Math.abs(qty * unitCost);

                  return (
                    <tr key={line.id || idx}>
                      <td className="row-num">{idx + 1}</td>
                      <td>
                        <div className="prod-cell">
                          <span className="prod-title">{prodName}</span>
                          <span className="prod-meta">SKU: {sku}{category !== '—' ? ` · ${category}` : ''}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="qty-val">
                          {!isTransfer && qty > 0 ? `+${qty}` : qty} {Math.abs(qty) === 1 ? 'unit' : 'units'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {unitCost > 0 ? `₹${unitCost.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {lineTotal > 0 ? `₹${lineTotal.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Totals Summary */}
        <div className="totals-block">
          <div className="totals-row">
            <span className="t-label">Total Items</span>
            <span className="t-val">{lines.length}</span>
          </div>
          <div className="totals-row">
            <span className="t-label">Total Quantity</span>
            <span className="t-val">{totalQty} units</span>
          </div>
          {totalValue > 0 && (
            <div className="totals-row grand orange-top">
              <span className="t-label bold">Grand Total</span>
              <span className="t-val bold">₹{totalValue.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Footer Actions Bar */}
        <div className="popup-actions-bar no-print">
          <button 
            className="btn-print-icon" 
            onClick={handlePrint}
            title="Print Document / Export PDF"
          >
            <FaPrint />
          </button>

          {isTransfer && status === 'IN_TRANSIT' && onConfirmTransfer && (
            <button 
              className="btn-confirm" 
              onClick={handleConfirmAction}
              disabled={confirming}
            >
              {confirming ? "Confirming..." : "Confirm Transfer Receipt"}
            </button>
          )}

          <button className="btn-close-orange" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <style jsx>{`
        .doc-viewer-content {
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #0f172a;
          padding: 4px 0;
        }

        .loading-banner {
          background: #fff7ed;
          color: #c2410c;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 12px;
          border: 1px solid #ffedd5;
        }

        .meta-row {
          display: grid;
          gap: 20px;
          align-items: flex-start;
        }

        .meta-row.grid-2 {
          grid-template-columns: repeat(2, 1fr);
        }

        .meta-row.single {
          grid-template-columns: 1fr;
        }

        @media (max-width: 640px) {
          .meta-row.grid-2 {
            grid-template-columns: 1fr;
          }
        }

        .meta-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .col-label {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .col-value {
          font-size: 14px;
          color: #0f172a;
        }

        .col-value.bold {
          font-weight: 700;
        }

        .col-subtext {
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }

        /* Orange Accent Dividers */
        .divider-line.orange-accent {
          height: 1px;
          background: linear-gradient(90deg, #f97316 0%, #ffedd5 35%, #f1f5f9 100%);
          margin: 16px 0;
        }

        /* Manifest Header */
        .items-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .section-label {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .count-pill.orange {
          background: #fff7ed;
          color: #ea580c;
          border: 1px solid #ffedd5;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 12px;
        }

        /* Items Table */
        .table-wrapper {
          width: 100%;
          overflow-x: auto;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .items-table th {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 10px 0;
          border-bottom: 2px solid #ffedd5;
          text-align: left;
        }

        .items-table td {
          padding: 14px 0;
          border-bottom: 1px solid #f8fafc;
          vertical-align: top;
        }

        .row-num {
          color: #64748b;
          font-weight: 500;
        }

        .prod-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .prod-title {
          font-weight: 700;
          color: #0f172a;
        }

        .prod-meta {
          font-size: 11px;
          color: #94a3b8;
        }

        .qty-val {
          color: #475569;
          font-weight: 600;
        }

        .empty-cell {
          text-align: center;
          color: #94a3b8;
          padding: 24px 0 !important;
        }

        /* Totals Block */
        .totals-block {
          align-self: flex-end;
          width: 280px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 20px;
          padding-top: 12px;
        }

        .totals-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #64748b;
        }

        .totals-row.grand.orange-top {
          padding-top: 10px;
          border-top: 2px solid #f97316;
          margin-top: 4px;
          font-size: 16px;
          color: #0f172a;
        }

        .t-label.bold, .t-val.bold {
          font-weight: 800;
        }

        /* Action Buttons Bar */
        .popup-actions-bar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #f1f5f9;
        }

        .btn-print-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: #fff7ed;
          border: 1px solid #ffedd5;
          color: #ea580c;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-print-icon:hover {
          background: #ea580c;
          color: #ffffff;
          border-color: #ea580c;
          transform: translateY(-1px);
        }

        .btn-confirm {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(249, 115, 22, 0.3);
        }

        .btn-confirm:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-close-orange {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
          transition: all 0.2s ease;
        }

        .btn-close-orange:hover {
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
          transform: translateY(-1px);
        }
      `}</style>
    </CafeQRPopup>
  );
}
