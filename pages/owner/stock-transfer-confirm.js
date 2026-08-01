import React, { useState, useEffect, useCallback, useMemo } from "react";

import { useAuth } from "../../context/AuthContext";
import DashboardLayout from "../../components/DashboardLayout";
import RoleGate from "../../components/RoleGate";
import ModuleGate from "../../components/ModuleGate";
import BranchRequiredGate from "../../components/BranchRequiredGate";
import ReportTable from "../../components/ReportTable";
import PremiumDateTimePicker from "../../components/PremiumDateTimePicker";
import NiceSelect from "../../components/NiceSelect";
import CafeQRPopup from "../../components/CafeQRPopup";
import StockDocumentViewerPopup from "../../components/purchasing/StockDocumentViewerPopup";
import api from "../../utils/api";
import { formatTzDate } from "../../utils/timezoneUtils";
import { generateStockTransferPdf } from "../../utils/stockTransferPdf";
import {
  FaSearch, FaCalendarAlt, FaCheckCircle, FaTruck,
  FaWarehouse, FaExchangeAlt, FaEye, FaFileAlt, FaPrint, FaEdit, FaBan, FaTimes
} from "react-icons/fa";

export default function StockTransferConfirmPage() {
  return (
    <RoleGate allowedRoles={["SUPER_ADMIN", "ADMIN", "MANAGER"]} requiredMenu="Stock">
      <ModuleGate>
        <BranchRequiredGate>
          <ConfirmContent />
        </BranchRequiredGate>
      </ModuleGate>
    </RoleGate>
  );
}

function ConfirmContent() {
  const { timezone, orgId, userRole } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("IN_TRANSIT");
  const [confirming, setConfirming] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);
  
  // Document Viewing Modal State (Triggered ONLY on Document No click)
  const [viewingDoc, setViewingDoc] = useState(null);
  
  // Edit Modal State
  const [editingDoc, setEditingDoc] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Void / Cancel Modal State
  const [voidingDoc, setVoidingDoc] = useState(null);
  const [voiding, setVoiding] = useState(false);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [dateFrom, setDateFrom] = useState(getTodayStr());
  const [dateTo, setDateTo] = useState(getTodayStr());

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tResp, wResp, pResp] = await Promise.all([
        api.get("/api/v1/inventory/transfers", { params: { size: 200 } }),
        api.get("/api/v1/warehouses"),
        api.get("/api/v1/products"),
      ]);
      const all = tResp.data?.data?.content || tResp.data?.data || [];
      setTransfers(all.filter(t => 
        t.status === "IN_TRANSIT" || 
        t.status === "CANCELLED" ||
        (t.status === "COMPLETED" && (t.wasInTransit === true || t.wasInTransit === "Y" || t.wasInTransit === "true" || t.wasInTransit === 1))
      ));
      if (wResp.data?.success) setWarehouses(wResp.data.data || []);
      if (pResp.data?.success) setProducts(pResp.data.data || []);
    } catch (err) {
      showToast("Failed to load transfers", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getWh = (id) => warehouses.find(w => String(w.id) === String(id));
  const getWhName = (id) => getWh(id)?.name || "—";
  const getProduct = (id) => products.find(p => String(p.id) === String(id));

  const toggleExpand = async (id, e) => {
    e && e.stopPropagation();
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    const t = transfers.find(x => x.id === id);
    if (t && (!t.lines || t.lines.length === 0)) {
      try {
        const res = await api.get(`/api/v1/inventory/transfers/${id}`);
        const fetchedTransfer = res.data?.data || res.data;
        if (fetchedTransfer && fetchedTransfer.lines) {
          setTransfers(prev => prev.map(item => item.id === id ? { ...item, lines: fetchedTransfer.lines } : item));
        }
      } catch (err) {
        console.error("Failed to fetch transfer lines:", err);
      }
    }
  };

  const handleConfirm = async (transfer, e) => {
    e && e.stopPropagation();
    setConfirming(prev => ({ ...prev, [transfer.id]: true }));
    try {
      await api.put(`/api/v1/inventory/transfers/${transfer.id}`, { ...transfer, status: "COMPLETED" });
      showToast(`${transfer.transferNumber} confirmed! Stock updated.`, "success");
      setTransfers(prev => prev.map(t => t.id === transfer.id ? { ...t, status: "COMPLETED" } : t));
      if (expanded === transfer.id) setExpanded(null);
    } catch (err) {
      showToast(err.response?.data?.message || "Confirmation failed", "error");
    } finally {
      setConfirming(prev => ({ ...prev, [transfer.id]: false }));
    }
  };

  const handleOpenEdit = async (transfer) => {
    try {
      const res = await api.get(`/api/v1/inventory/transfers/${transfer.id}`);
      const fullDoc = res.data?.data || res.data;
      setEditingDoc(fullDoc || transfer);
    } catch (err) {
      setEditingDoc(transfer);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    setSavingEdit(true);
    try {
      const res = await api.put(`/api/v1/inventory/transfers/${editingDoc.id}`, editingDoc);
      const updated = res.data?.data || editingDoc;
      showToast(`Transfer ${updated.transferNumber || ''} updated successfully!`, "success");
      setTransfers(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
      setEditingDoc(null);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to update transfer", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleVoidTransfer = async () => {
    if (!voidingDoc) return;
    setVoiding(true);
    try {
      const payload = {
        ...voidingDoc,
        status: "CANCELLED"
      };
      await api.put(`/api/v1/inventory/transfers/${voidingDoc.id}`, payload);
      showToast(`Transfer ${voidingDoc.transferNumber || ''} voided successfully!`, "success");
      setTransfers(prev => prev.map(t => t.id === voidingDoc.id ? { ...t, status: "CANCELLED" } : t));
      setVoidingDoc(null);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to void transfer", "error");
    } finally {
      setVoiding(false);
    }
  };

  const filtered = transfers.filter(t => {
    const matchStatus = !statusFilter || statusFilter === "ALL" ? true : t.status === statusFilter;
    const matchSearch =
      t.transferNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getWhName(t.sourceWarehouseId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      getWhName(t.destWarehouseId).toLowerCase().includes(searchTerm.toLowerCase());
    const matchWh = !warehouseFilter ||
      String(t.sourceWarehouseId) === String(warehouseFilter) ||
      String(t.destWarehouseId) === String(warehouseFilter);
    let matchDate = true;
    if (dateFrom) matchDate = new Date(t.transferDate) >= new Date(dateFrom);
    if (dateTo && matchDate) matchDate = new Date(t.transferDate) <= new Date(dateTo + "T23:59:59");
    return matchStatus && matchSearch && matchWh && matchDate;
  });

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setPage(0);
  }, [searchTerm, warehouseFilter, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedFiltered = useMemo(() => {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filtered, page]);


  const columns = [
    {
      key: "transferNumber", label: "DOCUMENT NO",
      render: (row) => (
        <span 
          className="doc-no-link" 
          onClick={(e) => { e.stopPropagation(); setViewingDoc(row); }}
          title="Click to view full transfer document popup"
          style={{ 
            color: '#ea580c', 
            fontWeight: 700, 
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: '3px'
          }}
        >
          {row.transferNumber}
        </span>
      )
    },
    {
      key: "transferDate", label: "DATE",
      render: (row) => formatTzDate(row.transferDate, timezone, { format: "datetime" }) || row.transferDate
    },
    {
      key: "source", label: "SOURCE WAREHOUSE",
      render: (row) => <span className="wh-text">{getWhName(row.sourceWarehouseId)}</span>
    },
    {
      key: "dest", label: "DESTINATION",
      render: (row) => <span className="wh-text">{getWhName(row.destWarehouseId)}</span>
    },
    {
      key: "items", label: "ITEMS", align: "center",
      render: (row) => <span className="item-count-badge">{row.lines?.length || 0}</span>
    },
    {
      key: "status", label: "STATUS",
      render: (row) => {
        const isCompleted = row.status === "COMPLETED";
        const isCancelled = row.status === "CANCELLED" || row.status === "VOIDED";
        return (
          <span 
            className="status-pill"
            style={{
              background: isCompleted ? '#ecfdf5' : isCancelled ? '#fef2f2' : '#fff7ed',
              color: isCompleted ? '#059669' : isCancelled ? '#dc2626' : '#ea580c',
              border: isCompleted ? '1px solid #a7f3d0' : isCancelled ? '1px solid #fecaca' : '1px solid #ffedd5',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap'
            }}
          >
            {isCompleted ? "CONFIRMED" : isCancelled ? "VOIDED" : "IN TRANSIT"}
          </span>
        );
      }
    },
    {
      key: "action", label: "ACTIONS", align: "right",
      render: (row) => {
        const sourceWh = getWh(row.sourceWarehouseId);
        const sourceOrgId = row.orgId || sourceWh?.orgId || sourceWh?.org_id || sourceWh?.organizationId;
        const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN';
        const isSourceOrg = isSuperAdmin || (orgId && String(sourceOrgId) === String(orgId));

        const destWh = getWh(row.destWarehouseId);
        const destOrgId = row.destOrgId || destWh?.orgId || destWh?.org_id || destWh?.organizationId;
        const isDestBranch = isSuperAdmin || !destOrgId || !orgId || String(destOrgId) === String(orgId);

        const isCompleted = row.status === "COMPLETED";
        const isCancelled = row.status === "CANCELLED" || row.status === "VOIDED";
        const isExpandedThis = expanded === row.id;

        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            {/* 1. Confirm Receipt Button Tile (Soft Green Tile) */}
            {!isCompleted && !isCancelled && isDestBranch && (
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#f0fdf4',
                  color: '#059669',
                  border: '1px solid #bbf7d0',
                  fontSize: '15px',
                  cursor: confirming[row.id] ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                title="Confirm Transfer Receipt"
                disabled={confirming[row.id]}
                onClick={(e) => handleConfirm(row, e)}
              >
                <FaCheckCircle />
              </button>
            )}

            {/* 2. View Line Items Table Tile (Soft Blue Tile) */}
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: isExpandedThis ? '#2563eb' : '#eff6ff',
                color: isExpandedThis ? '#ffffff' : '#2563eb',
                border: '1px solid #bfdbfe',
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
              title={isExpandedThis ? "Close Line Items Table" : "View Line Items Table"}
              onClick={(e) => toggleExpand(row.id, e)}
            >
              <FaEye />
            </button>

            {/* 3. Void Transfer Tile (Soft Red Tile) */}
            {isSourceOrg && !isCancelled && (
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  fontSize: '15px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                title="Void / Cancel Transfer"
                onClick={(e) => { e.stopPropagation(); setVoidingDoc(row); }}
              >
                <FaBan />
              </button>
            )}




            {/* 5. Print Document PDF Tile (Soft Slate Tile) -> DIRECTLY GENERATES PDF WITHOUT POPUP */}
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#f8fafc',
                color: '#475569',
                border: '1px solid #cbd5e1',
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
              title="Print Document / Export PDF"
              onClick={(e) => { 
                e.stopPropagation(); 
                generateStockTransferPdf(row, warehouses, products);
              }}
            >
              <FaPrint />
            </button>
          </div>
        );
      }
    }
  ];

  if (loading) return <div className="loading-state-premium"><span>Loading Transfer Confirmations...</span></div>;

  return (
    <DashboardLayout title="Transfer Confirmation" showBack={true}>
      <div className="report-container">

        {/* Filters Bar */}
        <div className="filters-bar">
          <div className="hist-dates">
            <PremiumDateTimePicker 
              value={dateFrom} 
              onChange={(val) => setDateFrom(val)} 
              themeColor="#f97316"
            />
            <span className="h-filter-sep">to</span>
            <PremiumDateTimePicker 
              value={dateTo} 
              onChange={(val) => setDateTo(val)} 
              themeColor="#f97316"
            />
          </div>

          <div className="wh-filter-group">
            <NiceSelect 
              options={[
                { value: 'IN_TRANSIT', label: 'Pending Transfers' },
                { value: 'COMPLETED', label: 'Confirmed Transfers' },
                { value: 'CANCELLED', label: 'Voided Transfers' },
                { value: 'ALL', label: 'All Transfers' }
              ]}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
            />
          </div>

          <div className="wh-filter-group">
            <NiceSelect 
              options={[
                { value: '', label: 'All Warehouses' },
                ...warehouses.map(w => ({ value: w.id, label: w.name }))
              ]}
              value={warehouseFilter}
              onChange={(val) => setWarehouseFilter(val)}
            />
          </div>

          <div className="search-box">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Search transfer # or warehouse..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Main Table */}
        <ReportTable

          columns={columns}
          data={paginatedFiltered}
          emptyIcon={<FaTruck />}
          emptyTitle="No Pending Confirmations"
          emptyText="All incoming stock transfers have been confirmed or processed."
          accentColor="#f97316"
          expandedRowId={expanded}
          expandedRowContent={(row) => (
            <div style={{ background: '#fffbf5', padding: '14px 20px 14px 48px', borderTop: '1px solid #fed7aa', borderBottom: '1px solid #fed7aa' }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(249,115,22,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#ffffff' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316', width: '36px' }}>#</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Product</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>SKU</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Category</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f97316' }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(row.lines && row.lines.length > 0) ? (
                      row.lines.map((line, i) => {
                        const p = getProduct(line.productId);
                        const productName = line.productName || p?.name || `Product #${i + 1}`;
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{productName}</td>
                            <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{line.sku || p?.productCode || '—'}</td>
                            <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{line.categoryName || p?.categoryName || '—'}</td>
                            <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                              <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', fontSize: '12px', fontWeight: 800, padding: '3px 10px', borderRadius: '6px', display: 'inline-block', minWidth: '32px', textAlign: 'center' }}>{line.transferQuantity}</span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ padding: '24px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, fontSize: '13px' }}>

                          No line items found for this transfer.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        />

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <button className="pg-btn" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
              ← Prev
            </button>
            <span className="pg-info">
              Page {page + 1} of {totalPages} &nbsp;·&nbsp; {filtered.length} transfers
            </span>
            <button className="pg-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
              Next →
            </button>
          </div>
        )}


        <div className="report-footer">
          <span>Showing {paginatedFiltered.length} of {filtered.length} transfers</span>
        </div>
      </div>


      {toast && (
        <div className={`tc-toast ${toast.type}`} onClick={() => setToast(null)}>
          {toast.type === "success" ? <FaCheckCircle /> : "⚠"}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Stock Document Viewer Popup (Opened ONLY via Document No link click) */}
      {viewingDoc && (
        <StockDocumentViewerPopup
          doc={viewingDoc}
          docType="stock_transfer"
          warehouses={warehouses}
          products={products}
          timezone={timezone}
          formatTzDate={formatTzDate}
          onClose={() => setViewingDoc(null)}
          onConfirmTransfer={async (transferDoc) => {
            await handleConfirm(transferDoc);
            setViewingDoc(null);
          }}
        />
      )}

      {/* Void Confirmation Modal */}
      {voidingDoc && (
        <CafeQRPopup
          title={`Void Transfer ${voidingDoc.transferNumber || ''}`}
          subtitle="Are you sure you want to void this stock transfer document?"
          maxWidth="500px"
          onClose={() => setVoidingDoc(null)}
          hideFooter={true}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
            <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: '1.5' }}>
              Voiding transfer <strong>{voidingDoc.transferNumber}</strong> will cancel the shipment record and revert stock balances. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  color: '#475569',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
                onClick={() => setVoidingDoc(null)}
              >
                Cancel
              </button>
              <button
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: voiding ? 'not-allowed' : 'pointer',
                  opacity: voiding ? 0.6 : 1
                }}
                disabled={voiding}
                onClick={handleVoidTransfer}
              >
                {voiding ? "Voiding..." : "Yes, Void Transfer"}
              </button>
            </div>
          </div>
        </CafeQRPopup>
      )}

      {/* Edit Transfer Modal */}
      {editingDoc && (
        <CafeQRPopup
          title={`Edit Transfer ${editingDoc.transferNumber || ''}`}
          subtitle="Modify notes or line item transfer quantities"
          maxWidth="720px"
          onClose={() => setEditingDoc(null)}
          hideFooter={true}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0' }}>

            {/* Warehouse Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source Warehouse</label>
                <input
                  type="text"
                  disabled
                  value={getWhName(editingDoc.sourceWarehouseId)}
                  style={{ width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#334155', boxSizing: 'border-box', cursor: 'default' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destination Warehouse</label>
                <input
                  type="text"
                  disabled
                  value={getWhName(editingDoc.destWarehouseId)}
                  style={{ width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#334155', boxSizing: 'border-box', cursor: 'default' }}
                />
              </div>
            </div>

            {/* Notes Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes / Remarks</label>
              <textarea
                value={editingDoc.notes || ''}
                onChange={(e) => setEditingDoc(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Enter transfer notes or reasons..."
                rows={2}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', color: '#0f172a' }}
              />
            </div>

            {/* Line Items Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items</span>
                <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px' }}>{editingDoc.lines?.length || 0}</span>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', maxHeight: '240px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #f97316', width: '70%' }}>Product Name</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #f97316', width: '30%' }}>Transfer Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editingDoc.lines || []).length === 0 ? (
                      <tr>
                        <td colSpan="2" style={{ padding: '20px', color: '#94a3b8', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>No line items found.</td>
                      </tr>
                    ) : (
                      (editingDoc.lines || []).map((line, idx) => {
                        const p = getProduct(line.productId);
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p?.name || line.productName || `Product #${idx + 1}`}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <input
                                type="number"
                                min="1"
                                value={line.transferQuantity || 1}
                                onChange={(e) => {
                                  const val = Math.max(1, Number(e.target.value));
                                  setEditingDoc(prev => {
                                    const updatedLines = [...(prev.lines || [])];
                                    updatedLines[idx] = { ...updatedLines[idx], transferQuantity: val };
                                    return { ...prev, lines: updatedLines };
                                  });
                                }}
                                style={{ width: '90px', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#0f172a', background: '#ffffff', boxSizing: 'border-box' }}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px', borderTop: '1px solid #f1f5f9' }}>
              <button
                style={{ background: '#f1f5f9', border: 'none', color: '#475569', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setEditingDoc(null)}
              >
                Cancel
              </button>
              <button
                style={{ background: savingEdit ? '#f97316' : '#ea580c', color: 'white', border: 'none', padding: '10px 22px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.75 : 1, boxShadow: '0 2px 8px rgba(234,88,12,0.3)', transition: 'all 0.2s' }}
                disabled={savingEdit}
                onClick={handleSaveEdit}
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </CafeQRPopup>
      )}

      <style jsx>{`
        .report-container { padding: 0 40px 40px; }
        @media (max-width: 768px) { .report-container { padding: 0 16px 24px; } }

        /* Lines Panel Styling */
        .lines-panel {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          margin-top: 16px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0,0,0,0.04);
        }

        .lines-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .lines-panel-title {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }

        .lines-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 14px;
          cursor: pointer;
          padding: 4px;
        }

        .lines-close-btn:hover {
          color: #0f172a;
        }

        .lines-table { width: 100%; border-collapse: collapse; }
        .lines-table th { padding: 12px 18px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #f97316; background: #ffffff; }
        .lines-table td { padding: 12px 18px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; }
        .lines-table tr:last-child td { border-bottom: none; }
        .r { text-align: right; }
        .td-num { color: #94a3b8; font-weight: 600; width: 40px; }
        .td-name { font-weight: 600; color: #1e293b; }
        .td-sku { color: #94a3b8; font-size: 12px; font-family: monospace; }
        .td-cat { color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; }
        .qty-badge { background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; display: inline-block; }

        /* Filters Bar */
        .filters-bar { background: white; border-radius: 16px; padding: 14px 20px; border: 1px solid #edf2f7; border-top: 3px solid #f97316; display: flex; align-items: center; gap: 12px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); flex-wrap: nowrap; overflow-x: auto; }
        .search-box { position: relative; width: 320px; flex-shrink: 0; margin-left: auto; }
        .search-box .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #f97316; font-size: 13px; }
        .search-box input { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px 8px 36px; border-radius: 10px; font-size: 12px; font-weight: 600; color: #1e293b; transition: 0.2s; box-sizing: border-box; }
        .search-box input:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15); }

        .hist-dates { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .h-filter-sep { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: lowercase; }

        .wh-filter-group { flex-shrink: 0; min-width: 170px; }

        .doc-no-link { color: #ea580c; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .wh-text { font-size: 13px; font-weight: 700; color: #1e293b; }
        .item-count-badge { font-size: 13px; font-weight: 700; color: #475569; }

        /* Pagination Bar */
        .pagination-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 16px 0 4px; }
        .pg-btn { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 18px; font-size: 13px; font-weight: 700; color: #f97316; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center; }
        .pg-btn:hover:not(:disabled) { background: #fff7ed; border-color: #f97316; transform: translateY(-1px); }
        .pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pg-info { font-size: 13px; font-weight: 700; color: #64748b; }

        /* Footer */
        .report-footer { padding: 16px 0; text-align: center; }
        .report-footer span { font-size: 12px; font-weight: 700; color: #94a3b8; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }


        /* Toast */
        .tc-toast { position: fixed; bottom: 24px; right: 24px; display: flex; align-items: center; gap: 10px; background: #1e293b; color: white; padding: 14px 20px; border-radius: 14px; font-size: 13px; font-weight: 700; box-shadow: 0 8px 30px rgba(0,0,0,0.25); z-index: 9999; cursor: pointer; animation: slideIn 0.3s ease; max-width: 340px; }
        .tc-toast.success svg { color: #f97316; }
        .tc-toast.error { background: #7f1d1d; }
        @keyframes slideIn { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </DashboardLayout>
  );
}
