import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { 
  FaPowerOff, FaSave, FaTag, FaMicrochip, FaSearch, FaPlus, FaChevronRight,
  FaPrint, FaBarcode, FaTabletAlt, FaLaptop, FaTools, FaCheckCircle, FaExclamationCircle
} from 'react-icons/fa';

/**
 * Device Management Page
 * Handles physical hardware provisioning (Printers, Scanners, etc.)
 */
export default function DevicesPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER']} requiredMenu="Organization">
      <DevicesContent />
    </RoleGate>
  );
}

function DevicesContent() {
  const { logout } = useAuth();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchData = async (currentSelection = null) => {
    try {
      const resp = await api.get('/api/v1/devices');
      if (resp.data.success) {
        const dList = resp.data.data || [];
        setDevices(dList);
        
        if (dList.length > 0 && !selectedDevice && !currentSelection) {
          setSelectedDevice(dList[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage(null);
    
    const isNew = !selectedDevice.id;
    const url = isNew ? '/api/v1/devices' : `/api/v1/devices/${selectedDevice.id}`;
    
    try {
      const resp = await (isNew ? api.post(url, selectedDevice) : api.put(url, selectedDevice));
      if (resp.data.success) {
        setMsgType('success');
        setMessage(isNew ? "Device provisioned!" : "Device updated!");
        const saved = resp.data.data;
        await fetchData(saved);
        setSelectedDevice(saved);
      } else {
        throw new Error(resp.data.message || "Action failed");
      }
    } catch (err) {
      setMsgType('error');
      setMessage(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };




  const startNewDevice = () => {
    setSelectedDevice({
      name: '',
      deviceType: 'PRINTER',
      serialNumber: '',
      isactive: 'Y'
    });
  };

  const getDeviceIcon = (type) => {
    switch (type) {
      case 'PRINTER': return <FaPrint />;
      case 'SCANNER': return <FaBarcode />;
      case 'TABLET': return <FaTabletAlt />;
      default: return <FaLaptop />;
    }
  };

  if (loading) return <div className="loading-state-premium"><span>Scanning Hardware...</span></div>;

  return (
    <DashboardLayout
      title="Device Management"
      showBack={true}
    >
      <div className="v2-layout-container">
        <aside className="v2-sidebar">
          <div className="sidebar-action-header">
            <h3>Registered Devices</h3>
            <button className="v2-add-btn" onClick={startNewDevice} title="Add New">
              <FaPlus />
            </button>
          </div>

          <div className="sidebar-search-box">
             <FaSearch className="search-icon" />
             <input 
               type="text" 
               placeholder="Search devices..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="v2-branch-grid">
            {devices
              .filter(dev => {
                const search = searchTerm.toLowerCase();
                return dev.name.toLowerCase().includes(search) || 
                       dev.deviceType.toLowerCase().includes(search) ||
                       dev.serialNumber?.toLowerCase().includes(search);
              })
              .map(dev => (
                <div
                  key={dev.id}
                  className={`v2-branch-card ${selectedDevice?.id === dev.id ? 'selected' : ''}`}
                  onClick={() => setSelectedDevice(dev)}
                >
                  <div className="card-status-pip" data-status={dev.isactive}></div>
                  <div className="card-info">
                    <span className="card-title">{dev.name}</span>
                    <span className="card-subtitle">{dev.deviceType}</span>
                  </div>
                  <FaChevronRight className="card-chevron" />
                </div>
              ))}

            {devices.length === 0 && (
              <div className="empty-state-sidebar">
                <FaMicrochip />
                <p>No devices found. Hardware is managed by technical administration.</p>
              </div>
            )}
          </div>
        </aside>

        <main className="v2-workspace">
          {selectedDevice ? (
            <div className="v2-form-container">
              <div className="v2-hero-card">
                <div className="hero-identity">
                  <div className="hero-icon-box">{getDeviceIcon(selectedDevice.deviceType)}</div>
                  <div className="hero-text">
                    <h2>{selectedDevice.id ? selectedDevice.name : "New Device Configuration"}</h2>
                    <p>{selectedDevice.id ? `ID: ${selectedDevice.id.slice(0, 8)}` : "Register a new hardware component"}</p>
                  </div>
                </div>
                <div className="hero-actions">
                   <div className={`v2-status-pill ${selectedDevice.isactive === 'Y' ? 'active' : 'inactive'}`} 
                        onClick={() => setSelectedDevice({...selectedDevice, isactive: selectedDevice.isactive === 'Y' ? 'N' : 'Y'})}>
                     <FaPowerOff /> {selectedDevice.isactive === 'Y' ? "Active" : "Inactive"}
                   </div>
                   <button onClick={handleSave} disabled={saving} className="v2-prime-save">
                     {saving ? "SAVING..." : <><FaSave /> Save</>}
                   </button>
                </div>
              </div>

              <div className="v2-detail-grid">
                <section className="v2-data-block">
                  <div className="block-header">
                    <FaTag className="block-icon" />
                    <h4>Device Identity</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Device Name <span style={{color:'red'}}>*</span></label>
                      <input 
                        type="text" 
                        value={selectedDevice.name}
                        onChange={(e) => setSelectedDevice({...selectedDevice, name: e.target.value})}
                        placeholder="e.g. Kitchen Printer"
                        required
                      />
                    </div>
                    <div className="v2-input-group">
                      <label>Serial Number / Unique ID</label>
                      <input 
                        type="text" 
                        value={selectedDevice.serialNumber || ''}
                        onChange={(e) => setSelectedDevice({...selectedDevice, serialNumber: e.target.value})}
                        placeholder="e.g. SN-123456789"
                      />
                    </div>
                  </div>
                </section>

                <section className="v2-data-block">
                  <div className="block-header">
                    <FaTools className="block-icon" />
                    <h4>Technical Specs</h4>
                  </div>
                  <div className="block-content">
                    <div className="v2-input-group">
                      <label>Hardware Type <span style={{color:'red'}}>*</span></label>
                      <NiceSelect 
                        options={[
                          { value: 'PRINTER', label: 'Thermal Printer' },
                          { value: 'SCANNER', label: 'Barcode Scanner' },
                          { value: 'TABLET', label: 'Display Tablet' },
                          { value: 'STATION', label: 'Billing Station' }
                        ]}
                        value={selectedDevice.deviceType}
                        onChange={(val) => setSelectedDevice({...selectedDevice, deviceType: val})}
                      />
                    </div>
                  </div>
                </section>
              </div>

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
              <h2>Hardware Inventory</h2>
              <p>Select a device to view details or add a new component to your ecosystem.</p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .v2-layout-container { display: grid; grid-template-columns: 320px 1fr; gap: 24px; width: 100%; padding: 0 24px; }
        .v2-sidebar { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); border-radius: 20px; border: 1px solid #edf2f7; padding: 20px; display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 180px); position: sticky; top: 24px; }
        .sidebar-action-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; }
        .sidebar-action-header h3 { margin: 0; font-size: 14px; font-weight: 800; color: #1a202c; letter-spacing: 0.5px; text-transform: uppercase; }
        .v2-add-btn { width: 36px; height: 36px; background: #000; color: white; border: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
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

        .v2-branch-grid { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
        .v2-branch-card { padding: 12px 14px; border-radius: 12px; background: white; border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .v2-branch-card.selected { border-color: #f97316; background: #fffaf0; }
        .card-status-pip { width: 4px; height: 24px; border-radius: 2px; background: #e2e8f0; }
        .card-status-pip[data-status="Y"] { background: #10b981; }
        .card-info { flex: 1; display: flex; flex-direction: column; }
        .card-title { font-size: 15px; font-weight: 700; color: #1e293b; }
        .card-subtitle { font-size: 12px; color: #94a3b8; }
        .v2-hero-card { background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .hero-identity { display: flex; align-items: center; gap: 16px; }
        .hero-icon-box { width: 48px; height: 48px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #64748b; }
        .hero-text h2 { margin: 0; font-size: 20px; font-weight: 900; }
        .hero-actions { display: flex; align-items: center; gap: 16px; }
        .v2-status-pill { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 12px; font-size: 12px; font-weight: 800; cursor: pointer; }
        .v2-status-pill.active { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .v2-status-pill.inactive { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }
        .v2-prime-save { background: #f97316; color: white; border: none; padding: 12px 28px; border-radius: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 10px; }
        .v2-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .v2-data-block { background: white; border-radius: 16px; border: 1px solid #edf2f7; padding: 20px; }
        .block-header { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #f8fafc; padding-bottom: 12px; margin-bottom: 16px; }
        .block-header h4 { margin: 0; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #475569; }
        .v2-input-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
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
        .v2-input-group input:focus { outline: none; border-color: #f97316; background: white; }
        .v2-toast { position: fixed; bottom: 32px; right: 32px; padding: 16px 24px; border-radius: 12px; background: #1e293b; color: white; display: flex; align-items: center; gap: 12px; font-weight: 700; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }
        .v2-empty-state { height: calc(100vh - 180px); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: white; border-radius: 20px; border: 1px solid #edf2f7; padding: 60px; }
        .empty-symbol { font-size: 48px; color: #e2e8f0; margin-bottom: 24px; }
      `}</style>
    </DashboardLayout>
  );
}
