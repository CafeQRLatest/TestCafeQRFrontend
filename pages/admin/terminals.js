import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { 
  FaMicrochip, FaPlus, FaCheckCircle, FaExclamationCircle, 
  FaLaptop, FaTabletAlt, FaMobileAlt, FaSatelliteDish, FaChevronRight,
  FaPowerOff, FaSave, FaTag, FaTools, FaSearch
} from 'react-icons/fa';

/**
 * Premium Terminal Management Page (v2)
 * Mirrored from Branch Management aesthetic for consistency.
 */
export default function TerminalsPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'STAFF']} requiredMenu="Organization">
      <TerminalsContent />
    </RoleGate>
  );
}

function TerminalsContent() {
  const { logout } = useAuth();
  const [terminals, setTerminals] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  // Centralized Toast Management
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchData = async (currentSelection = null) => {
    try {
      const [termResp, orgResp, devResp] = await Promise.all([
        api.get('/api/v1/terminals'),
        api.get('/api/v1/organizations'),
        api.get('/api/v1/devices')
      ]);

      if (termResp.data.success) {
        const rawTerms = termResp.data.data || [];
        setTerminals(rawTerms);
        if (rawTerms.length > 0 && !selectedTerminal && !currentSelection) {
          setSelectedTerminal(rawTerms[0]);
        }
      }
      
      if (orgResp.data.success) {
        setOrganizations(orgResp.data.data || []);
      }
      
      if (devResp.data.success) {
        setDevices(devResp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage(null);
    
    const isNew = !selectedTerminal.id;
    const url = isNew ? '/api/v1/terminals' : `/api/v1/terminals/${selectedTerminal.id}`;
    
    try {
      const payload = { 
        ...selectedTerminal,
        orgId: selectedTerminal.orgId
      };
      delete payload.organization;

      const resp = await (isNew ? api.post(url, payload) : api.put(url, payload));
      
      if (resp.data.success) {
        setMsgType('success');
        setMessage(isNew ? "Terminal provisioned!" : "Settings saved!");
        const savedData = resp.data.data;
        await fetchData(savedData);
        setSelectedTerminal(savedData);
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

  const startNewTerminal = () => {
    setSelectedTerminal({
      name: '',
      terminalCode: '',
      deviceType: 'DESKTOP',
      orgId: organizations.length > 0 ? organizations[0].id : '',
      isactive: 'Y'
    });
  };



  const getDeviceIcon = () => {
    // Try to find the linked device to get its type
    const linkedDevice = devices.find(d => d.id === selectedTerminal?.deviceId);
    const type = linkedDevice?.deviceType || selectedTerminal?.deviceType;
    
    switch (type) {
      case 'TABLET': return <FaTabletAlt />;
      case 'MOBILE': return <FaMobileAlt />;
      case 'PRINTER': return <FaPlus />; // Or a printer icon if imported
      default: return <FaLaptop />;
    }
  };

  if (loading) return <div className="loading-state-premium"><span>Syncing Hardware Network...</span></div>;

  return (
    <DashboardLayout
      title="Terminal Management"
      showBack={true}
    >
      <div className="v2-layout-container">

        {/* Navigation Rail */}
        <aside className="v2-sidebar">
          <div className="sidebar-action-header">
            <h3>Terminals</h3>
            <button className="v2-add-btn" onClick={startNewTerminal} title="Provision New">
              <FaPlus />
            </button>
          </div>


          <div className="sidebar-search-box">
             <FaSearch className="search-icon" />
             <input 
               type="text" 
               placeholder="Search terminals..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="v2-branch-grid">
            {terminals
              .filter(term => {
                const search = searchTerm.toLowerCase();
                const branchName = term.organization?.name || 
                                 organizations.find(o => o.id === term.orgId)?.name || 
                                 '';
                return term.name.toLowerCase().includes(search) || 
                       term.terminalCode?.toLowerCase().includes(search) ||
                       branchName.toLowerCase().includes(search);
              })
              .map(term => {
                const branchName = term.organization?.name || 
                                 organizations.find(o => o.id === term.orgId)?.name || 
                                 'NO-BRANCH';
                
                return (
                  <div
                    key={term.id}
                    className={`v2-branch-card ${selectedTerminal?.id === term.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTerminal(term)}
                  >
                    <div className="card-status-pip" data-status={term.isactive}></div>
                    <div className="card-info">
                      <span className="card-title">{term.name}</span>
                      <span className="card-code">{term.terminalCode || 'NO-CODE'}</span>
                      <div className="card-tag-row">
                        <span className="branch-tag">{branchName}</span>
                      </div>
                    </div>
                    <FaChevronRight className="card-chevron" />
                  </div>
                );
              })}

            {terminals.length === 0 && (
              <div className="empty-state-sidebar">
                <FaSatelliteDish />
                <p>{terminals.length === 0 ? "No terminals found." : "No matches for this filter."}</p>
              </div>
            )}
          </div>
        </aside>

        {/* Dynamic Workspace */}
        <main className="v2-workspace">
          {selectedTerminal ? (
            <div className="v2-form-container">
              
              {/* Header Card */}
              <div className="v2-hero-card">
                <div className="hero-identity">
                  <div className="hero-icon-box">{getDeviceIcon()}</div>
                  <div className="hero-text">
                    <h2>{selectedTerminal.id ? selectedTerminal.name : "Initialize Terminal"}</h2>
                    <p>{selectedTerminal.id ? `Terminal ID: ${selectedTerminal.id.slice(0, 8)}` : "Configure new POS terminal"}</p>
                  </div>
                </div>
                <div className="hero-actions">
                   <div className={`v2-status-pill ${selectedTerminal.isactive === 'Y' ? 'active' : 'inactive'}`} 
                        onClick={() => setSelectedTerminal({...selectedTerminal, isactive: selectedTerminal.isactive === 'Y' ? 'N' : 'Y'})}>
                     <FaPowerOff /> {selectedTerminal.isactive === 'Y' ? "IsActive" : "InActive"}
                   </div>
                   <button onClick={handleSave} disabled={saving} className="v2-prime-save">
                     {saving ? "SAVING..." : <><FaSave /> Save</>}
                   </button>
                </div>
              </div>

              {/* Grouped Information Cards */}
              <div className="v2-detail-grid">
                
                {/* 1. Identity & Code */}
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaTag className="block-icon" />
                    <h4>Identity & Code</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Terminal Display Name <span style={{color:'red'}}>*</span></label>
                      <input 
                        type="text" 
                        value={selectedTerminal.name}
                        onChange={(e) => setSelectedTerminal({...selectedTerminal, name: e.target.value})}
                        placeholder="e.g. Counter 01"
                        required
                      />
                    </div>
                    <div className="v2-input-group">
                      <label>Unique Terminal Code <span style={{color:'red'}}>*</span></label>
                      <input 
                        type="text" 
                        value={selectedTerminal.terminalCode || ''}
                        onChange={(e) => setSelectedTerminal({...selectedTerminal, terminalCode: e.target.value.toUpperCase()})}
                        placeholder="POS-TER-01"
                        required
                      />
                    </div>
                  </div>
                </section>

                {/* 2. Hardware & Assignment */}
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaTools className="block-icon" />
                    <h4>Hardware & Assignment</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Hardware Device</label>
                      <NiceSelect 
                        options={[
                          { value: '', label: 'No Device Assigned' },
                          ...devices.map(dev => ({ value: dev.id, label: `${dev.name} (${dev.deviceType})` }))
                        ]}
                        value={selectedTerminal.deviceId || ''}
                        onChange={(val) => {
                          const dev = devices.find(d => d.id === val);
                          setSelectedTerminal({
                            ...selectedTerminal, 
                            deviceId: val,
                            deviceType: dev ? dev.deviceType : selectedTerminal.deviceType
                          });
                        }}
                      />
                    </div>
                    <div className="v2-input-group">
                      <label>Assign to Branch <span style={{color:'red'}}>*</span></label>
                      <NiceSelect 
                        options={organizations.map(org => ({ value: org.id, label: org.name }))}
                        value={selectedTerminal.orgId || (selectedTerminal.organization?.id)}
                        onChange={(val) => setSelectedTerminal({...selectedTerminal, orgId: val})}
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
              <div className="empty-symbol"><FaMicrochip /></div>
              <h2>Terminal Hardware Scanning</h2>
              <p>Select a terminal from the left panel to manage its configuration or provision a new one.</p>
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
          padding: 0 20px;
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

        .sidebar-filter {
          margin-bottom: 8px;
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

        .card-info { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
        .card-title { font-size: 15px; font-weight: 800; color: #1e293b; line-height: 1.2; }
        .card-code { font-size: 11px; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px; }
        .card-tag-row { margin-top: 2px; }
        .branch-tag { color: #f97316; font-weight: 800; background: #fff7ed; padding: 2px 8px; border-radius: 6px; font-size: 10px; text-transform: uppercase; border: 1px solid #ffedd5; display: inline-block; }
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
        .block-header { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #f8fafc; padding-bottom: 12px; }
        .block-icon { font-size: 14px; color: #f97316; }
        .block-header h4 { margin: 0; font-size: 13px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }

        .v2-input-group { display: flex; flex-direction: column; gap: 6px; }
        .v2-input-group label { font-size: 11px; font-weight: 700; color: #64748b; }
        .v2-input-group input { 
          background: #fcfcfd; 
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 10px 12px; 
          font-size: 14px; 
          font-weight: 600; 
          color: #1e293b; 
          width: 100%;
        }
        .v2-input-group input::placeholder { color: #cbd5e1; }
        .v2-input-group input:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px #fff7ed; }

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
