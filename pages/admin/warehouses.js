import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import api from '../../utils/api';
import { 
  FaCheckCircle, FaExclamationCircle, FaWarehouse, FaChevronRight,
  FaSearch, FaSave, FaPowerOff, FaMapMarkerAlt, FaUserEdit, FaPhone,
  FaPlus, FaBuilding, FaStar
} from 'react-icons/fa';


export default function WarehouseManagementPage() {
  return (
    <RoleGate>
      <WarehouseContent />
    </RoleGate>
  );
}

function WarehouseContent() {
  const { userRole, orgId } = useAuth();
  const currentOrgId = orgId || (typeof window !== 'undefined' ? (require('js-cookie').default.get('orgId') || '') : '');

  const [warehouses, setWarehouses] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = true; // Bypassed as per request: no role required

  useEffect(() => {
    fetchData();
  }, [currentOrgId]);

  const fetchData = async (currentSelection = null) => {
    try {
      const params = currentOrgId ? { orgId: currentOrgId } : {};
      const [wResp, oResp] = await Promise.all([
        api.get('/api/v1/warehouses', { params }),
        api.get('/api/v1/organizations')
      ]);
      
      // Trust the backend to return the right warehouses for this org — no client-side filter needed
      const raw = wResp.data.success ? (wResp.data.data || []) : [];

      setWarehouses(raw);

      if (oResp.data.success) {
        setOrgs(oResp.data.data || []);
      }

      if (raw.length > 0) {
        if (currentSelection && raw.some(w => w.id === currentSelection.id)) {
          setSelectedWarehouse(currentSelection);
        } else {
          setSelectedWarehouse(raw[0]);
        }
      } else {
        setSelectedWarehouse({
          name: '',
          code: '',
          address: '',
          managerName: '',
          managerPhone: '',
          orgId: currentOrgId,
          isActive: 'Y',
          isDefault: true
        });
      }
    } catch (err) {
      console.error("Failed to load warehouse data:", err);
    } finally {
      setLoading(false);
    }
  };


  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;

    if (!selectedWarehouse.name?.trim()) {
      setMsgType('error');
      setMessage("Warehouse Name is required");
      return;
    }

    const effectiveOrgId = selectedWarehouse.orgId || currentOrgId;
    const warehouseToSave = { ...selectedWarehouse, orgId: effectiveOrgId };

    setSaving(true);
    setMessage(null);
    
    const isNew = !warehouseToSave.id;
    const url = isNew ? '/api/v1/warehouses' : `/api/v1/warehouses/${warehouseToSave.id}`;
    
    try {
      const resp = await (isNew ? api.post(url, warehouseToSave) : api.put(url, warehouseToSave));
      if (resp.data.success) {
        setMsgType('success');
        setMessage(isNew ? "Warehouse created!" : "Warehouse updated!");
        fetchData(resp.data.data);
      } else {
        throw new Error(resp.data.message || "Failed to save");
      }
    } catch (err) {
      setMsgType('error');
      setMessage(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const startNew = () => {
    if (!isAdmin) return;
    setSelectedWarehouse({
      name: '',
      code: '',
      address: '',
      managerName: '',
      managerPhone: '',
      orgId: currentOrgId,
      isActive: 'Y',
      isDefault: true
    });
  };

  if (loading) return <div className="loading-state-premium"><span>Allocating Storage Nodes...</span></div>;

  return (
    <DashboardLayout title="Warehouse Master" showBack={true} backUrl="/owner/stock-menu">
      <div className="v2-layout-container">
        <aside className="v2-sidebar">
          <div className="sidebar-action-header">
            <h3>Warehouses</h3>
            {isAdmin && (
              <button className="v2-add-btn" onClick={startNew} title="Add Warehouse">
                <FaPlus />
              </button>
            )}
          </div>

          <div className="sidebar-search-box">
             <FaSearch className="search-icon" />
             <input 
               type="text" 
               placeholder="Search warehouses..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="v2-branch-grid">
            {warehouses
              .filter(w => (w.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (w.code || '').toLowerCase().includes(searchTerm.toLowerCase()))
              .map(w => (
                <div 
                  key={w.id} 
                  className={`v2-branch-card ${selectedWarehouse?.id === w.id ? 'selected' : ''}`}
                  onClick={() => setSelectedWarehouse(w)}
                >
                  <div className="card-status-pip" data-status={w.isActive}></div>
                  <div className="card-info">
                    <span className="card-title">
                      {w.name}
                      {w.isDefault && <span className="default-badge"><FaStar /> DEFAULT</span>}
                    </span>
                    <span className="card-code">{w.code || 'NO-CODE'}</span>
                  </div>
                  <FaChevronRight className="card-chevron" />
                </div>
              ))}
          </div>
        </aside>

        <main className="v2-workspace">
          {selectedWarehouse ? (
            <div className="v2-form-container">
              <div className="v2-hero-card">
                <div className="hero-identity">
                  <div className="hero-icon-box"><FaWarehouse /></div>
                  <div className="hero-text">
                    <h2>{selectedWarehouse.id ? selectedWarehouse.name : "Establish New Warehouse"}</h2>
                    <p>{selectedWarehouse.id ? `Warehouse ID: ${selectedWarehouse.id.slice(0, 8)}` : "Configure physical and management details"}</p>
                  </div>
                </div>
                <div className="hero-actions">
                   <div className={`v2-status-pill ${selectedWarehouse.isActive === 'Y' ? 'active' : 'inactive'}`} 
                        onClick={() => {
                          if (!isAdmin) return;
                          setSelectedWarehouse({...selectedWarehouse, isActive: selectedWarehouse.isActive === 'Y' ? 'N' : 'Y'})
                        }}>
                     <FaPowerOff /> {selectedWarehouse.isActive === 'Y' ? "Active" : "Inactive"}
                   </div>
                   {isAdmin && (
                     <button onClick={handleSave} disabled={saving} className="v2-prime-save">
                       {saving ? "SAVING..." : <><FaSave /> Save Warehouse</>}
                     </button>
                   )}
                </div>
              </div>

              <div className="v2-detail-grid">
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaBuilding className="block-icon" />
                    <h4>Core Identification</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Warehouse Name <span className="req">*</span></label>
                      <input type="text" readOnly={!isAdmin} value={selectedWarehouse.name} onChange={(e) => setSelectedWarehouse({...selectedWarehouse, name: e.target.value})} placeholder="e.g. Central Kitchen" required />
                    </div>
                    <div className="v2-input-group">
                      <label>System Code</label>
                      <input type="text" readOnly={!isAdmin} value={selectedWarehouse.code || ''} onChange={(e) => setSelectedWarehouse({...selectedWarehouse, code: e.target.value})} placeholder="WH-001" />
                    </div>


                    {/* Default Warehouse Checkbox */}
                    <div className="v2-checkbox-group">
                      <label className="v2-checkbox-label">
                        <input 
                          type="checkbox" 
                          disabled={!isAdmin || warehouses.length <= 1 || Boolean(selectedWarehouse?.id && selectedWarehouse?.isDefault)}
                          checked={warehouses.length <= 1 ? true : Boolean(selectedWarehouse?.isDefault)} 
                          onChange={(e) => setSelectedWarehouse({...selectedWarehouse, isDefault: e.target.checked})} 
                        />
                        <span className="checkbox-text">Default Warehouse for Organization</span>
                      </label>
                      <span className="checkbox-hint">
                        {selectedWarehouse?.isDefault 
                          ? 'This is currently the default warehouse for the organization. To change the default warehouse, edit another warehouse and mark it as default.' 
                          : 'Stock for completed sales and purchases in this organization will automatically use this warehouse.'}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="v2-data-block">
                  <div className="block-header">
                    <FaUserEdit className="block-icon" />
                    <h4>Management & Logistics</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Manager Name</label>
                      <input type="text" readOnly={!isAdmin} value={selectedWarehouse.managerName || ''} onChange={(e) => setSelectedWarehouse({...selectedWarehouse, managerName: e.target.value})} placeholder="In-charge Name" />
                    </div>
                    <div className="v2-input-group">
                      <label>Contact Phone</label>
                      <input type="tel" readOnly={!isAdmin} value={selectedWarehouse.managerPhone || ''} onChange={(e) => setSelectedWarehouse({...selectedWarehouse, managerPhone: e.target.value})} placeholder="+1 234..." />
                    </div>
                    <div className="v2-input-group">
                      <label>Address / Coordinates</label>
                      <textarea 
                        readOnly={!isAdmin} 
                        value={selectedWarehouse.address || ''} 
                        onChange={(e) => setSelectedWarehouse({...selectedWarehouse, address: e.target.value})} 
                        placeholder="Detailed physical address..."
                        className="erp-textarea-modern"
                      />
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="v2-empty-state">
              <div className="empty-symbol"><FaWarehouse /></div>
              <h2>Storage Grid Offline</h2>
              <p>Select a warehouse location from the sidebar to manage its profile or provision a new storage hub.</p>
            </div>
          )}

          {message && (
            <div className={`v2-toast ${msgType}`} onClick={() => setMessage(null)}>
              {msgType === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
              <span>{message}</span>
              <div className="toast-close">×</div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .v2-layout-container { display: grid; grid-template-columns: 320px 1fr; gap: 24px; width: 100%; padding: 0 24px; }
        .v2-sidebar { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); border-radius: 20px; border: 1px solid #edf2f7; padding: 20px; display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 180px); position: sticky; top: 24px; }
        .sidebar-action-header { display: flex; justify-content: space-between; align-items: center; }
        .sidebar-action-header h3 { margin: 0; font-size: 14px; font-weight: 800; color: #1a202c; text-transform: uppercase; letter-spacing: 0.5px; }
        .v2-add-btn { width: 36px; height: 36px; background: #000; color: white; border: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .sidebar-search-box { position: relative; }
        .sidebar-search-box .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 14px; }
        .sidebar-search-box input { width: 100%; padding: 10px 10px 10px 38px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 13px; font-weight: 600; color: #1e293b; }
        .v2-branch-grid { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
        .v2-branch-card { padding: 12px 14px; border-radius: 12px; background: white; border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .v2-branch-card.selected { border-color: #f97316; background: #fffaf0; box-shadow: 0 8px 20px rgba(249, 115, 22, 0.08); }
        .card-status-pip { width: 4px; height: 24px; border-radius: 2px; background: #e2e8f0; }
        .card-status-pip[data-status="Y"] { background: #10b981; }
        .card-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .card-title { font-size: 13px; font-weight: 800; color: #1e293b; }
        .card-code { font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
        .card-chevron { font-size: 12px; color: #cbd5e1; }
        .v2-hero-card { background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .hero-identity { display: flex; align-items: center; gap: 16px; }
        .hero-icon-box { width: 48px; height: 48px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #64748b; }
        .hero-text h2 { margin: 0; font-size: 18px; font-weight: 900; color: #0f172a; }
        .hero-text p { margin: 2px 0 0; font-size: 11px; color: #94a3b8; font-weight: 600; }
        .hero-actions { display: flex; align-items: center; gap: 16px; }
        .v2-status-pill { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; cursor: pointer; }
        .v2-status-pill.active { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .v2-status-pill.inactive { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }
        .v2-prime-save { background: #f97316; color: white; border: none; padding: 12px 28px; border-radius: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 10px; }
        .v2-detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .v2-data-block { background: white; border-radius: 16px; border: 1px solid #edf2f7; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
        .block-header { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f8fafc; padding-bottom: 10px; margin-bottom: 4px; }
        .block-header h4 { margin: 0; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
        .block-icon { font-size: 12px; color: #f97316; }
        .v2-input-group { display: flex; flex-direction: column; gap: 6px; }
        .v2-input-group label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; }
        .req { color: #ef4444; }
        .v2-input-group input, .erp-input-modern, .erp-textarea-modern { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; font-size: 14px; font-weight: 700; color: #1e293b; width: 100%; transition: 0.2s; }
        .v2-input-group input:focus, .erp-input-modern:focus, .erp-textarea-modern:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px #fff7ed; }
        .erp-textarea-modern { min-height: 80px; resize: vertical; margin-top: 4px; }
        .v2-toast { position: fixed; bottom: 32px; right: 32px; padding: 16px 24px; border-radius: 12px; background: #1e293b; color: white; display: flex; align-items: center; gap: 12px; font-weight: 700; box-shadow: 0 20px 40px rgba(0,0,0,0.15); z-index: 1000; }
        .v2-toast.success { border-left: 4px solid #10b981; }
        .v2-toast.error { border-left: 4px solid #ef4444; }
        .toast-close { margin-left: 12px; font-size: 20px; cursor: pointer; }
        .v2-empty-state { height: calc(100vh - 180px); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: white; border-radius: 20px; border: 1px solid #edf2f7; }
        .empty-symbol { font-size: 40px; color: #e2e8f0; margin-bottom: 16px; }
        .v2-empty-state h2 { margin: 0; font-size: 18px; font-weight: 900; color: #1e293b; }
        .v2-empty-state p { margin: 8px 0 0; color: #94a3b8; font-size: 13px; max-width: 280px; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }
        /* Default warehouse checkbox styling */
        .default-badge { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; font-size: 9px; font-weight: 800; color: #d97706; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 2px 6px; vertical-align: middle; text-transform: uppercase; }
        .v2-checkbox-group { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; margin-top: 4px; }
        .v2-checkbox-label { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
        .v2-checkbox-label input[type="checkbox"] { width: 18px; height: 18px; accent-color: #f97316; cursor: pointer; border-radius: 4px; }
        .checkbox-text { font-size: 13px; font-weight: 700; color: #1e293b; }
        .checkbox-hint { font-size: 11px; color: #64748b; font-weight: 500; margin-left: 28px; }
      `}</style>
    </DashboardLayout>
  );
}
