import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import api from '../../utils/api';
import { 
  FaSave, FaCheckCircle, FaExclamationCircle, FaPlus, FaStore, 
  FaEnvelope, FaPhone, FaMapMarkerAlt, FaCompass, 
  FaTruckMoving, FaPowerOff, FaLocationArrow, FaCity,
  FaShieldAlt, FaInfoCircle, FaChevronRight, FaSearch
} from 'react-icons/fa';

/**
 * Premium Branch Management Page (v2)
 * Features a modern card-based layout with grouped information blocks.
 */
export default function OrganizationDetailsPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN']} requiredMenu="Organization">
      <OrganizationSettingsContent />
    </RoleGate>
  );
}

function OrganizationSettingsContent() {
  const { logout } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchOrganizations();
  }, []);

  // Centralized Toast Management
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchOrganizations = async () => {
    try {
      const resp = await api.get('/api/v1/organizations');
      if (resp.data.success) {
        const data = resp.data.data || [];
        setOrganizations(data);
        if (data.length > 0 && !selectedOrg) {
          setSelectedOrg(data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch organizations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage(null);
    
    const isNew = !selectedOrg.id;
    const url = isNew ? '/api/v1/organizations' : `/api/v1/organizations/${selectedOrg.id}`;
    
    try {
      const payload = { ...selectedOrg };
      delete payload.client; 

      const resp = await (isNew ? api.post(url, payload) : api.put(url, payload));
      
      if (resp.data.success) {
        setMsgType('success');
        setMessage(isNew ? "Branch created successfully!" : "Settings saved successfully!");
        const savedData = resp.data.data;
        fetchOrganizations();
        setSelectedOrg(savedData);
      } else {
        throw new Error(resp.data.message || "Transaction failed");
      }
    } catch (err) {
      setMsgType('error');
      setMessage(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const startNewBranch = () => {
    setSelectedOrg({
      name: '',
      email: '',
      phone: '',
      address: '',
      pinCode: '',
      gstin: '',
      branchCode: 'HQ',
      isactive: 'Y',
      deliveryRadiusKm: 5,
      latitude: null,
      longitude: null
    });
  };


  const fetchCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setSelectedOrg({
          ...selectedOrg,
          latitude: parseFloat(position.coords.latitude.toFixed(6)),
          longitude: parseFloat(position.coords.longitude.toFixed(6))
        });
        setMsgType('success');
        setMessage("Real-time coordinates captured!");
      }, (error) => {
        setMsgType('error');
        setMessage("GPS access denied.");
      });
    } else {
      setMsgType('error');
      setMessage("Browser does not support GPS.");
    }
  };

  if (loading) return <div className="loading-state-premium"><span>Syncing Global Locations...</span></div>;

  return (
    <DashboardLayout 
      title="Branch Management" 
      showBack={true}
    >
      <div className="v2-layout-container">
        
        {/* Navigation Rail */}
        <aside className="v2-sidebar">
          <div className="sidebar-action-header">
            <h3>Branches</h3>
            <button className="v2-add-btn" onClick={startNewBranch} title="Expand Network">
              <FaPlus />
            </button>
          </div>

          <div className="sidebar-search-box">
             <FaSearch className="search-icon" />
             <input 
               type="text" 
               placeholder="Search branches..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="v2-branch-grid">
            {organizations
              .filter(org => {
                const search = searchTerm.toLowerCase();
                return org.name.toLowerCase().includes(search) || 
                       org.pinCode?.toLowerCase().includes(search) ||
                       org.email?.toLowerCase().includes(search);
              })
              .map(org => (
                <div 
                  key={org.id} 
                  className={`v2-branch-card ${selectedOrg?.id === org.id ? 'selected' : ''}`}
                  onClick={() => setSelectedOrg(org)}
                >
                  <div className="card-status-pip" data-status={org.isactive}></div>
                  <div className="card-info">
                    <span className="card-title">{org.name}</span>
                    <span className="card-subtitle">{org.pinCode ? `PIN: ${org.pinCode}` : 'Profile Incomplete'}</span>
                  </div>
                  <FaChevronRight className="card-chevron" />
                </div>
              ))}

            {organizations.length === 0 && (
              <div className="empty-state-sidebar">
                <FaInfoCircle />
                <p>No active branches found. Branch data is managed by technical administration.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Dynamic Workspace */}
        <main className="v2-workspace">
          {selectedOrg ? (
            <div className="v2-form-container">
              
              {/* Header Card */}
              <div className="v2-hero-card">
                <div className="hero-identity">
                  <div className="hero-icon-box"><FaStore /></div>
                  <div className="hero-text">
                    <h2>{selectedOrg.id ? selectedOrg.name : "Establish New Location"}</h2>
                    <p>{selectedOrg.id ? `Branch ID: ${selectedOrg.id.slice(0, 8)}` : "Configure your branch details below"}</p>
                  </div>
                </div>
                <div className="hero-actions">
                   <div className={`v2-status-pill ${selectedOrg.isactive === 'Y' ? 'active' : 'inactive'}`} 
                        onClick={() => setSelectedOrg({...selectedOrg, isactive: selectedOrg.isactive === 'Y' ? 'N' : 'Y'})}>
                     <FaPowerOff /> {selectedOrg.isactive === 'Y' ? "IsActive" : "InActive"}
                   </div>
                   <button onClick={handleSave} disabled={saving} className="v2-prime-save">
                     {saving ? "SAVING..." : <><FaSave /> Save Changes</>}
                   </button>
                </div>
              </div>

              {/* Grouped Information Cards */}
              <div className="v2-detail-grid">
                
                {/* 1. Identity & Compliance */}
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaShieldAlt className="block-icon" />
                    <h4>Identity & Compliance</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Public Branch Name <span style={{color:'red'}}>*</span></label>
                      <input 
                        type="text" 
                        value={selectedOrg.name}
                        onChange={(e) => setSelectedOrg({...selectedOrg, name: e.target.value})}
                        placeholder="e.g. Thalassery Main"
                        required
                      />
                    </div>
                    <div className="v2-input-group">
                      <label>Branch Code (for Numbering) <span style={{color:'red'}}>*</span></label>
                      <input 
                        type="text" 
                        value={selectedOrg.branchCode || ''}
                        onChange={(e) => setSelectedOrg({...selectedOrg, branchCode: e.target.value.toUpperCase().replace(/\s/g, '')})}
                        placeholder="e.g. THA"
                        required
                      />
                      <small>Short code used in Order/Invoice numbering</small>
                    </div>
                    <div className="v2-input-group">
                      <label>GSTIN / Tax ID</label>
                      <input 
                        type="text" 
                        value={selectedOrg.gstin || ''}
                        onChange={(e) => setSelectedOrg({...selectedOrg, gstin: e.target.value.toUpperCase()})}
                        placeholder="29AAAAA0000A1Z5"
                      />
                      <small>Leave blank to inherit business default</small>
                    </div>
                  </div>
                </section>

                {/* 2. Communication Hub */}
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaEnvelope className="block-icon" />
                    <h4>Communication Hub</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Operational Email <span style={{color:'red'}}>*</span></label>
                      <div className="icon-input">
                        <FaEnvelope className="inner-icon" />
                        <input 
                          type="email" 
                          value={selectedOrg.email || ''}
                          onChange={(e) => setSelectedOrg({...selectedOrg, email: e.target.value})}
                          placeholder="branch@cafeqr.com"
                        />
                      </div>
                    </div>
                    <div className="v2-input-group">
                      <label>Direct Contact Phone <span style={{color:'red'}}>*</span></label>
                      <div className="icon-input">
                        <FaPhone className="inner-icon" />
                        <input 
                          type="tel" 
                          value={selectedOrg.phone || ''}
                          onChange={(e) => setSelectedOrg({...selectedOrg, phone: e.target.value})}
                          placeholder="+91 99000 00000"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* 3. Physical Footprint */}
                <section className="v2-data-block full">
                  <div className="block-header">
                    <FaCity className="block-icon" />
                    <h4>Physical Footprint</h4>
                  </div>
                  <div className="block-content dual">
                    <div className="v2-input-group">
                      <label>Street Address <span style={{color:'red'}}>*</span></label>
                      <textarea 
                        value={selectedOrg.address || ''}
                        onChange={(e) => setSelectedOrg({...selectedOrg, address: e.target.value})}
                        placeholder="Full address for bills and maps..."
                        rows="3"
                      />
                    </div>
                    <div className="v2-input-group">
                      <label>Zip / Pin Code</label>
                      <input 
                        type="text" 
                        value={selectedOrg.pinCode || ''}
                        onChange={(e) => setSelectedOrg({...selectedOrg, pinCode: e.target.value})}
                        placeholder="670101"
                      />
                    </div>
                  </div>
                </section>

                {/* 4. Delivery & Logistics */}
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaTruckMoving className="block-icon" />
                    <h4>Logistics & Range</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Local Delivery Range (km)</label>
                      <div className="range-combo-box">
                        <div className="range-input-row">
                          <input 
                            type="number" 
                            min="0.5" 
                            max="20000" 
                            step={selectedOrg.deliveryRadiusKm < 100 ? 0.5 : 10}
                            value={selectedOrg.deliveryRadiusKm || 5}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0.5;
                              setSelectedOrg({...selectedOrg, deliveryRadiusKm: Math.min(20000, Math.max(0.5, val))});
                            }}
                            className="radius-number-input"
                          />
                          <span className="unit-label">km</span>
                          <button 
                            type="button" 
                            className="quick-set-btn"
                            onClick={() => setSelectedOrg({...selectedOrg, deliveryRadiusKm: 20000})}
                          >
                            🌍 Worldwide
                          </button>
                        </div>
                        <input 
                          type="range" 
                          min="0.5" 
                          max="20000" 
                          step={selectedOrg.deliveryRadiusKm < 100 ? 0.5 : 10}
                          value={selectedOrg.deliveryRadiusKm || 5}
                          onChange={(e) => setSelectedOrg({...selectedOrg, deliveryRadiusKm: parseFloat(e.target.value)})}
                          className="radius-slider"
                        />
                        <div className="range-smart-label">
                          {(() => {
                            const r = selectedOrg.deliveryRadiusKm || 5;
                            if (r >= 20000) return "🌍 Worldwide Delivery Service";
                            if (r >= 2000) return `🌐 Continental / Nationwide (${r.toFixed(0)} km)`;
                            if (r >= 500) return `🚆 Regional / State-wide (${r.toFixed(0)} km)`;
                            if (r >= 50) return `🚗 City-wide (${r.toFixed(0)} km)`;
                            return `🚲 Local Delivery (${r.toFixed(1)} km)`;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 5. Geospatial Alignment */}
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaCompass className="block-icon" />
                    <h4>Geospatial Alignment</h4>
                    <button type="button" className="gps-btn" onClick={fetchCurrentLocation}>
                      <FaLocationArrow /> Use Current Location
                    </button>
                  </div>
                  <div className="block-content coords">
                    <div className="v2-input-group">
                      <label>Latitude</label>
                      <input 
                        type="number" step="0.000001"
                        value={selectedOrg.latitude || ''}
                        onChange={(e) => setSelectedOrg({...selectedOrg, latitude: e.target.value ? parseFloat(e.target.value) : null})}
                      />
                    </div>
                    <div className="v2-input-group">
                      <label>Longitude</label>
                      <input 
                        type="number" step="0.000001"
                        value={selectedOrg.longitude || ''}
                        onChange={(e) => setSelectedOrg({...selectedOrg, longitude: e.target.value ? parseFloat(e.target.value) : null})}
                      />
                    </div>
                  </div>
                </section>

              </div>

              {/* Toast */}
              {message && (
                <div className={`v2-toast ${msgType}`} onClick={() => setMessage(null)}>
                  {msgType === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
                  <span>{message}</span>
                  <div className="toast-close">×</div>
                </div>
              )}
            </div>
          ) : (
            <div className="v2-empty-state">
              <div className="empty-symbol"><FaMapMarkerAlt /></div>
              <h2>Select a Point of Interest</h2>
              <p>Choose a location from the left panel to modify its configuration or expand your business network.</p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .v2-layout-container {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 24px;
          width: 100%;
          padding: 0 24px;
        }

        .v2-sidebar {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          border: 1px solid #edf2f7;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: calc(100vh - 180px);
          position: sticky;
          top: 24px;
        }

        .sidebar-action-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 4px;
        }

        .sidebar-action-header h3 {
          margin: 0; font-size: 14px; font-weight: 800; color: #1a202c; letter-spacing: 0.5px; text-transform: uppercase;
        }

        .v2-add-btn {
          width: 36px; height: 36px; background: #000; color: white; border: none; border-radius: 10px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .v2-add-btn:hover { background: #333; }

        .sidebar-search-box {
          position: relative;
          margin-bottom: 8px;
        }
        .sidebar-search-box .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 14px;
        }
        .sidebar-search-box input {
          width: 100%;
          padding: 10px 10px 10px 38px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
        }
        .sidebar-search-box input:focus {
          outline: none;
          border-color: #f97316;
          background: white;
          box-shadow: 0 0 0 3px #fff7ed;
        }

        .v2-branch-grid { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 4px; }
        
        .v2-branch-card {
          padding: 12px 14px; border-radius: 12px; background: white; border: 1px solid #f1f5f9;
          display: flex; align-items: center; gap: 12px; cursor: pointer; position: relative;
        }
        .v2-branch-card:hover { border-color: #cbd5e1; }
        .v2-branch-card.selected { border-color: #f97316; background: #fffaf0; box-shadow: 0 8px 20px rgba(249, 115, 22, 0.08); }

        .card-status-pip { width: 4px; height: 24px; border-radius: 2px; background: #e2e8f0; }
        .card-status-pip[data-status="Y"] { background: #10b981; }
        .v2-branch-card.selected .card-status-pip { background: #f97316; height: 32px; }

        .card-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .card-title { font-size: 15px; font-weight: 700; color: #1e293b; }
        .card-subtitle { font-size: 12px; color: #94a3b8; font-weight: 500; }
        .card-chevron { font-size: 12px; color: #cbd5e1; transition: 0.3s; }
        .v2-branch-card.selected .card-chevron { color: #f97316; transform: translateX(4px); }

        .v2-hero-card {
          background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7;
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
        }

        .hero-identity { display: flex; align-items: center; gap: 16px; }
        .hero-icon-box { width: 48px; height: 48px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #64748b; }
        .hero-text h2 { margin: 0; font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
        .hero-text p { margin: 2px 0 0; font-size: 12px; color: #94a3b8; font-weight: 600; }

        .hero-actions { display: flex; align-items: center; gap: 16px; }
        .v2-status-pill {
          display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 12px;
          font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer;
        }
        .v2-status-pill.active { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .v2-status-pill.inactive { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }

        .v2-prime-save {
          background: #f97316; color: white; border: none; padding: 12px 28px; border-radius: 12px;
          font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 10px;
          box-shadow: 0 4px 10px rgba(249, 115, 22, 0.2);
        }
        .v2-prime-save:hover { background: #ea580c; }

        .v2-detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .v2-data-block { background: white; border-radius: 16px; border: 1px solid #edf2f7; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .v2-data-block.full { grid-column: 1 / -1; }
        .block-header { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #f8fafc; padding-bottom: 12px; position: relative; }
        .block-icon { font-size: 14px; color: #f97316; }
        .block-header h4 { margin: 0; font-size: 13px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }

        .gps-btn { position: absolute; right: 0; display: flex; align-items: center; gap: 6px; background: #fff7ed; border: 1px solid #ffedd5; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; color: #c2410c; cursor: pointer; }
        .gps-btn:hover { background: #ffedd5; }
        
        .v2-input-group { display: flex; flex-direction: column; gap: 6px; }
        .v2-input-group label { font-size: 11px; font-weight: 700; color: #64748b; }
        .v2-input-group input, .v2-input-group textarea { background: #fcfcfd; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: #1e293b; }
        .v2-input-group input:focus, .v2-input-group textarea:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px #fff7ed; }
        .v2-input-group small { font-size: 11px; color: #94a3b8; font-weight: 500; }

        .icon-input { position: relative; }
        .inner-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #cbd5e1; }
        .icon-input input { padding-left: 40px; }

        .block-content.dual { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
        .block-content.coords { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .slider-box { display: flex; align-items: center; gap: 16px; }
        .slider-box input { flex: 1; accent-color: #f97316; }
        .slider-value { font-size: 14px; font-weight: 800; color: #1e293b; min-width: 50px; background: #f8fafc; padding: 6px 10px; border-radius: 8px; text-align: center; }
        .range-combo-box { display: flex; flex-direction: column; gap: 12px; }
        .range-input-row { display: flex; align-items: center; gap: 8px; }
        .radius-number-input { width: 100px !important; text-align: right; font-weight: 800 !important; color: #1e293b; }
        .unit-label { font-size: 14px; font-weight: 800; color: #64748b; margin-right: auto; }
        .quick-set-btn { 
          background: #fff7ed; border: 1px solid #ffedd5; padding: 8px 14px; border-radius: 10px; 
          font-size: 12px; font-weight: 800; color: #c2410c; cursor: pointer; display: flex; align-items: center; gap: 4px;
          transition: all 0.2s;
        }
        .quick-set-btn:hover { background: #ffedd5; transform: scale(1.02); }
        .radius-slider { width: 100%; accent-color: #f97316; cursor: pointer; }
        .range-smart-label { font-size: 11px; font-weight: 700; color: #f97316; background: #fff7ed; padding: 6px 12px; border-radius: 8px; width: fit-content; }

        .v2-toast {
          position: fixed; bottom: 32px; right: 32px; padding: 16px 24px; border-radius: 12px;
          background: #1e293b; color: white; display: flex; align-items: center; gap: 12px;
          font-weight: 700; box-shadow: 0 20px 40px rgba(0,0,0,0.15); z-index: 1000;
        }
        .v2-toast.success { border-left: 4px solid #10b981; }
        .v2-toast.error { border-left: 4px solid #ef4444; }
        .toast-close { margin-left: 12px; font-size: 20px; opacity: 0.5; cursor: pointer; }

        .v2-empty-state {
          height: calc(100vh - 180px); display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; background: white; border-radius: 20px; border: 1px solid #edf2f7; padding: 60px;
        }
        .empty-symbol { font-size: 48px; color: #e2e8f0; margin-bottom: 24px; }
        .v2-empty-state h2 { margin: 0; font-size: 20px; font-weight: 900; color: #1e293b; }
        .v2-empty-state p { margin: 12px 0 32px; color: #94a3b8; max-width: 340px; font-weight: 500; font-size: 15px; }
        .v2-prime-setup {
          background: #f97316; color: white; border: none; padding: 14px 32px; border-radius: 14px;
          font-weight: 800; cursor: pointer; box-shadow: 0 8px 20px rgba(249, 115, 22, 0.2);
        }

        .empty-state-sidebar { padding: 40px 20px; text-align: center; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .empty-state-sidebar p { font-size: 13px; font-weight: 600; margin: 0; }
        .empty-state-sidebar :global(svg) { font-size: 24px; opacity: 0.5; }

        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }

        @media (max-width: 1024px) {
          .v2-layout-container { grid-template-columns: 1fr; }
          .v2-sidebar { height: auto; position: relative; top: 0; }
          .v2-detail-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </DashboardLayout>
  );
}
