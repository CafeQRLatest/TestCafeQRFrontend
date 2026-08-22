import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { 
  FaSave, FaCheckCircle, FaExclamationCircle, FaPlus, FaStore, 
  FaEnvelope, FaPhone, FaMapMarkerAlt, FaCompass, 
  FaTruckMoving, FaPowerOff, FaLocationArrow, FaCity,
  FaShieldAlt, FaInfoCircle, FaChevronRight, FaSearch, FaTag,
  FaImage, FaTrash, FaUpload, FaGlobe, FaCopy, FaExternalLinkAlt
} from 'react-icons/fa';

/**
 * Compresses and resizes any image to an ultra-efficient WebP data URI.
 * Maintains aspect ratio, caps at maxWidth/maxHeight, and encodes to WebP at specified quality.
 * Typical output size: 40KB - 75KB for a 1200x450 banner from a 10MB camera photo.
 */
function compressImageToWebP(file, maxWidth = 1200, maxHeight = 450, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        const scale = Math.min(maxWidth / width, maxHeight / height, 1);
        const targetWidth = Math.round(width * scale);
        const targetHeight = Math.round(height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        let webpData = canvas.toDataURL('image/webp', quality);
        if (!webpData.startsWith('data:image/webp')) {
          webpData = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(webpData);
      };
      img.onerror = reject;
      img.src = readerEvent.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const POS_CATEGORY_OPTIONS = [
  { value: 'Restaurant', label: '🍽️ Restaurant' },
  { value: 'Cafe', label: '☕ Cafe & Bistro' },
  { value: 'QSR', label: '⚡ QSR & Fast Food' },
  { value: 'Bakery', label: '🥐 Bakery & Pastry' },
  { value: 'Bar', label: '🍸 Bar & Lounge' },
  { value: 'Boutique', label: '👗 Boutique & Fashion' },
  { value: 'Grocery', label: '🛒 Grocery & Supermarket' },
  { value: 'Salon', label: '💇 Salon & Spa' },
  { value: 'Others', label: '🏬 Retail & General Store' },
];

/**
 * Premium Branch Management Page (v2)
 * Features a modern card-based layout with grouped information blocks.
 */
export default function OrganizationDetailsPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'STAFF']} requiredMenu="Organization">
      <OrganizationSettingsContent />
    </RoleGate>
  );
}

function OrganizationSettingsContent() {
  const { logout, posType: clientPosType, user } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [clientData, setClientData] = useState(null);

  const getDeliveryUrl = (org) => {
    let defaultBaseUrl = 'https://test-cafe-qr-delivery-website.vercel.app';
    if (typeof window !== 'undefined' && !window.location.hostname.includes('test')) {
      defaultBaseUrl = 'https://cafeqr-delivery-website.vercel.app';
    }
    const baseUrl = process.env.NEXT_PUBLIC_DELIVERY_SITE_URL || defaultBaseUrl;

    if (!org) return baseUrl;

    const branchSlug = org.slug || '';
    const clientSlug = clientData?.slug || user?.clientSlug || user?.slug || '';

    if (clientSlug && branchSlug) {
      if (clientSlug === branchSlug) {
        return `${baseUrl}/${clientSlug}`;
      }
      return `${baseUrl}/${clientSlug}/${branchSlug}`;
    } else if (clientSlug) {
      return `${baseUrl}/${clientSlug}`;
    } else if (branchSlug) {
      return `${baseUrl}/${branchSlug}`;
    }

    const clientId = org.clientId || user?.clientId || '';
    const orgId = org.id || '';
    return `${baseUrl}/order?r=${clientId}&t=DELIVERY${orgId ? `&orgId=${orgId}` : ''}`;
  };

  const copyToClipboard = (url) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setMessage("Storefront URL copied to clipboard!");
      setMsgType("success");
      setTimeout(() => setCopiedUrl(false), 3000);
    }
  };

  useEffect(() => {
    fetchOrganizations();
    fetchClient();
  }, []);

  const fetchClient = async () => {
    try {
      const resp = await api.get('/api/v1/clients/me');
      if (resp.data?.success) {
        setClientData(resp.data.data);
      }
    } catch (e) { }
  };

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
      slug: '',
      bannerUrl: '',
      posType: clientPosType || 'Restaurant',
      isactive: 'Y',
      deliveryRadiusKm: 5,
      latitude: null,
      longitude: null,
      timezone: 'Asia/Kolkata'
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
      backUrl="/admin/organization"
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
                return (org.name || '').toLowerCase().includes(search) || 
                       (org.posType || '').toLowerCase().includes(search) ||
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                      <span className="card-title">{org.name}</span>
                      {org.posType && <span className="card-cat-badge">{org.posType}</span>}
                    </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h2>{selectedOrg.id ? selectedOrg.name : "Establish New Location"}</h2>
                      {selectedOrg.posType && (
                        <span className="hero-cat-tag">
                          <FaTag style={{ fontSize: '10px' }} /> {selectedOrg.posType}
                        </span>
                      )}
                    </div>
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

              {/* Live Public Storefront Link Bar */}
              {selectedOrg.id && (
                <div className="v2-store-link-card">
                  <div className="store-link-info">
                    <div className="store-link-badge">
                      <FaGlobe /> LIVE DELIVERY STOREFRONT URL
                    </div>
                    <a
                      href={getDeliveryUrl(selectedOrg)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="store-link-url"
                    >
                      {getDeliveryUrl(selectedOrg)}
                    </a>
                  </div>
                  <div className="store-link-actions">
                    <button
                      type="button"
                      className="store-action-btn copy"
                      onClick={() => copyToClipboard(getDeliveryUrl(selectedOrg))}
                    >
                      <FaCopy /> {copiedUrl ? "Copied!" : "Copy Link"}
                    </button>
                    <a
                      href={getDeliveryUrl(selectedOrg)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="store-action-btn visit"
                    >
                      <FaExternalLinkAlt /> Visit Store
                    </a>
                  </div>
                </div>
              )}

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
                        placeholder="e.g. Thalassery Main / Calicut Boutique"
                        required
                      />
                    </div>
                    <div className="v2-input-group">
                      <label>Business Category / Outlet Type</label>
                      <NiceSelect 
                        options={POS_CATEGORY_OPTIONS}
                        value={selectedOrg.posType || clientPosType || 'Restaurant'}
                        onChange={(val) => setSelectedOrg({...selectedOrg, posType: val})}
                        placeholder="Choose Category..."
                      />
                      <small>Determines the branch&apos;s primary business specialization</small>
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
                      <label>Branch URL Slug</label>
                      <input 
                        type="text" 
                        value={selectedOrg.slug || ''}
                        onChange={(e) => setSelectedOrg({...selectedOrg, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                        placeholder="e.g. main-outlet"
                      />
                      <small>Clean URL handle for customer direct ordering</small>
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
                  <div className="block-content dual" style={{ marginTop: '0px' }}>
                    <div className="v2-input-group">
                      <label>Timezone</label>
                      <select 
                        value={selectedOrg.timezone || 'Asia/Kolkata'}
                        onChange={(e) => setSelectedOrg({...selectedOrg, timezone: e.target.value})}
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (India - IST)</option>
                        <option value="Asia/Muscat">Asia/Muscat (Oman - GST)</option>
                        <option value="Asia/Dubai">Asia/Dubai (UAE - GST)</option>
                        <option value="Asia/Qatar">Asia/Qatar (AST)</option>
                        <option value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia - AST)</option>
                        <option value="Asia/Bahrain">Asia/Bahrain (AST)</option>
                        <option value="Asia/Kuwait">Asia/Kuwait (AST)</option>
                        <option value="UTC">UTC (Universal Time)</option>
                      </select>
                      <small>Used for daily reports and order timing</small>
                    </div>
                  </div>
                </section>

                {/* 4. Branding & Delivery Website Hero Banner */}
                <section className="v2-data-block full">
                  <div className="block-header">
                    <FaImage className="block-icon" />
                    <h4>Delivery Website Hero Banner</h4>
                  </div>
                  <div className="block-content">
                    <div className="banner-uploader-container">
                      <div className="banner-preview-box">
                        {selectedOrg.bannerUrl ? (
                          <div className="banner-image-wrapper">
                            <img src={selectedOrg.bannerUrl} alt="Hero Banner Preview" className="banner-preview-img" />
                            <button
                              type="button"
                              className="remove-banner-btn"
                              onClick={() => setSelectedOrg({...selectedOrg, bannerUrl: ''})}
                              title="Remove Banner"
                            >
                              <FaTrash /> Remove
                            </button>
                          </div>
                        ) : (
                          <div className="banner-placeholder-box">
                            <FaImage className="banner-ph-icon" />
                            <p className="banner-ph-title">No Custom Hero Banner Uploaded</p>
                            <p className="banner-ph-sub">Your delivery site currently displays the category default gradient & watermark.</p>
                          </div>
                        )}
                      </div>

                      <div className="banner-control-panel">
                        <label className="banner-upload-label">
                          <input 
                            type="file" 
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const webpBase64 = await compressImageToWebP(file, 1200, 450, 0.82);
                                if (webpBase64) {
                                  setSelectedOrg(prev => ({ ...prev, bannerUrl: webpBase64 }));
                                  setMessage("Hero banner optimized (WebP ~50KB) and ready to save!");
                                  setMsgType("success");
                                }
                              } catch (err) {
                                console.error("Compression failed:", err);
                                setMessage("Failed to process image. Please try another file.");
                                setMsgType("error");
                              }
                            }}
                          />
                          <FaUpload /> {selectedOrg.bannerUrl ? "Change Hero Banner" : "Upload Hero Banner"}
                        </label>
                        <div className="banner-hints">
                          <p><strong>Recommended Aspect Ratio:</strong> 16:6 widescreen landscape (e.g. 1200 × 450 px).</p>
                          <p><strong>Ultra-Fast WebP Compression:</strong> Images are automatically resized and converted to lightweight WebP format to save space and load instantly on mobile.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 5. Delivery & Logistics */}
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
        .card-cat-badge { font-size: 10px; font-weight: 800; text-transform: uppercase; background: #fff7ed; color: #ea580c; padding: 2px 7px; border-radius: 6px; border: 1px solid #ffedd5; letter-spacing: 0.3px; }
        .card-subtitle { font-size: 12px; color: #94a3b8; font-weight: 500; }
        .card-chevron { font-size: 12px; color: #cbd5e1; transition: 0.3s; }
        .v2-branch-card.selected .card-chevron { color: #f97316; transform: translateX(4px); }

        .v2-hero-card {
          background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7;
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
        }

        .v2-store-link-card {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          border-radius: 16px; padding: 18px 24px; margin-bottom: 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25); border: 1px solid #334155;
        }
        .store-link-info { display: flex; flex-direction: column; gap: 4px; min-width: 260px; flex: 1; }
        .store-link-badge { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; color: #f97316; letter-spacing: 0.5px; }
        .store-link-url { font-size: 14px; font-weight: 700; color: #f8fafc; text-decoration: none; word-break: break-all; }
        .store-link-url:hover { color: #fdba74; text-decoration: underline; }
        .store-link-actions { display: flex; align-items: center; gap: 10px; }
        .store-action-btn {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 10px;
          font-size: 12px; font-weight: 800; text-decoration: none; cursor: pointer; transition: all 0.2s; border: none;
        }
        .store-action-btn.copy { background: #f97316; color: white; }
        .store-action-btn.copy:hover { background: #ea580c; transform: translateY(-1px); }
        .store-action-btn.visit { background: rgba(255,255,255,0.1); color: #f1f5f9; border: 1px solid rgba(255,255,255,0.2); }
        .store-action-btn.visit:hover { background: rgba(255,255,255,0.2); transform: translateY(-1px); }

        .hero-identity { display: flex; align-items: center; gap: 16px; }
        .hero-icon-box { width: 48px; height: 48px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #64748b; }
        .hero-text h2 { margin: 0; font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
        .hero-cat-tag { display: inline-flex; align-items: center; gap: 5px; background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 3px 9px; border-radius: 8px; border: 1px solid #dbeafe; letter-spacing: 0.5px; }
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
        .v2-input-group input, .v2-input-group textarea, .v2-input-group select { background: #fcfcfd; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 600; color: #1e293b; }
        .v2-input-group input:focus, .v2-input-group textarea:focus, .v2-input-group select:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px #fff7ed; }
        .v2-input-group small { font-size: 11px; color: #94a3b8; font-weight: 500; }

        .icon-input { position: relative; }
        .inner-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #cbd5e1; }
        .icon-input input { padding-left: 40px; }

        .block-content.dual { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
        .block-content.coords { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .banner-uploader-container { display: flex; flex-direction: column; gap: 16px; }
        .banner-preview-box {
          width: 100%; height: 180px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 14px;
          overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center;
        }
        .banner-image-wrapper { width: 100%; height: 100%; position: relative; }
        .banner-preview-img { width: 100%; height: 100%; object-fit: cover; object-position: center; }
        .remove-banner-btn {
          position: absolute; top: 12px; right: 12px; background: rgba(239, 68, 68, 0.9);
          color: white; border: none; padding: 6px 14px; border-radius: 8px; font-size: 11px;
          font-weight: 800; display: flex; align-items: center; gap: 6px; cursor: pointer;
          backdrop-filter: blur(4px); transition: 0.2s;
        }
        .remove-banner-btn:hover { background: #dc2626; transform: scale(1.05); }
        .banner-placeholder-box { display: flex; flex-direction: column; align-items: center; gap: 6px; color: #94a3b8; text-align: center; padding: 20px; }
        .banner-ph-icon { font-size: 32px; color: #cbd5e1; margin-bottom: 4px; }
        .banner-ph-title { margin: 0; font-size: 13px; font-weight: 800; color: #64748b; }
        .banner-ph-sub { margin: 0; font-size: 11px; font-weight: 500; color: #94a3b8; }
        
        .banner-control-panel { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .banner-upload-label {
          display: inline-flex; align-items: center; gap: 8px; background: #fff7ed; border: 1px solid #ffedd5;
          color: #c2410c; padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 800;
          cursor: pointer; transition: all 0.2s;
        }
        .banner-upload-label:hover { background: #ffedd5; transform: scale(1.02); }
        .banner-hints { flex: 1; min-width: 260px; font-size: 11px; color: #64748b; line-height: 1.5; }
        .banner-hints p { margin: 2px 0; }
        .banner-hints strong { color: #334155; }

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
