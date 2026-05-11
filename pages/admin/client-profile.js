import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { resolveTimezone } from '../../utils/timezoneUtils';
import { FaSave, FaCheckCircle, FaExclamationCircle, FaUserCircle, FaGlobe, FaIdCard, FaEdit, FaTimes, FaLock, FaPalette, FaClock, FaInstagram, FaFacebook, FaUniversity, FaImage } from 'react-icons/fa';

// ─── Comprehensive Country → Currency / Timezone mapping ───────────────
const COUNTRY_DATA = {
  // Asia - South
  'India':          { currency: 'INR', timezone: 'Asia/Kolkata',         tzLabel: 'India (GMT+5:30)' },
  'Sri Lanka':      { currency: 'LKR', timezone: 'Asia/Colombo',        tzLabel: 'Sri Lanka (GMT+5:30)' },
  'Nepal':          { currency: 'NPR', timezone: 'Asia/Kathmandu',      tzLabel: 'Nepal (GMT+5:45)' },
  'Pakistan':       { currency: 'PKR', timezone: 'Asia/Karachi',        tzLabel: 'Pakistan (GMT+5:00)' },
  'Bangladesh':     { currency: 'BDT', timezone: 'Asia/Dhaka',          tzLabel: 'Bangladesh (GMT+6:00)' },
  'Maldives':       { currency: 'MVR', timezone: 'Indian/Maldives',     tzLabel: 'Maldives (GMT+5:00)' },
  // Asia - Middle East
  'UAE':            { currency: 'AED', timezone: 'Asia/Dubai',           tzLabel: 'UAE (GMT+4:00)' },
  'Saudi Arabia':   { currency: 'SAR', timezone: 'Asia/Riyadh',         tzLabel: 'Saudi Arabia (GMT+3:00)' },
  'Qatar':          { currency: 'QAR', timezone: 'Asia/Qatar',           tzLabel: 'Qatar (GMT+3:00)' },
  'Oman':           { currency: 'OMR', timezone: 'Asia/Muscat',          tzLabel: 'Oman (GMT+4:00)' },
  'Kuwait':         { currency: 'KWD', timezone: 'Asia/Kuwait',          tzLabel: 'Kuwait (GMT+3:00)' },
  'Bahrain':        { currency: 'BHD', timezone: 'Asia/Bahrain',         tzLabel: 'Bahrain (GMT+3:00)' },
  'Jordan':         { currency: 'JOD', timezone: 'Asia/Amman',           tzLabel: 'Jordan (GMT+3:00)' },
  'Lebanon':        { currency: 'LBP', timezone: 'Asia/Beirut',          tzLabel: 'Lebanon (GMT+2:00)' },
  'Iraq':           { currency: 'IQD', timezone: 'Asia/Baghdad',         tzLabel: 'Iraq (GMT+3:00)' },
  'Iran':           { currency: 'IRR', timezone: 'Asia/Tehran',          tzLabel: 'Iran (GMT+3:30)' },
  'Turkey':         { currency: 'TRY', timezone: 'Europe/Istanbul',      tzLabel: 'Turkey (GMT+3:00)' },
  'Israel':         { currency: 'ILS', timezone: 'Asia/Jerusalem',       tzLabel: 'Israel (GMT+2:00)' },
  // Asia - Southeast
  'Singapore':      { currency: 'SGD', timezone: 'Asia/Singapore',       tzLabel: 'Singapore (GMT+8:00)' },
  'Malaysia':       { currency: 'MYR', timezone: 'Asia/Kuala_Lumpur',    tzLabel: 'Malaysia (GMT+8:00)' },
  'Thailand':       { currency: 'THB', timezone: 'Asia/Bangkok',         tzLabel: 'Thailand (GMT+7:00)' },
  'Indonesia':      { currency: 'IDR', timezone: 'Asia/Jakarta',         tzLabel: 'Indonesia (GMT+7:00)' },
  'Philippines':    { currency: 'PHP', timezone: 'Asia/Manila',          tzLabel: 'Philippines (GMT+8:00)' },
  'Vietnam':        { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh',     tzLabel: 'Vietnam (GMT+7:00)' },
  'Cambodia':       { currency: 'KHR', timezone: 'Asia/Phnom_Penh',      tzLabel: 'Cambodia (GMT+7:00)' },
  'Myanmar':        { currency: 'MMK', timezone: 'Asia/Yangon',          tzLabel: 'Myanmar (GMT+6:30)' },
  // Asia - East
  'Japan':          { currency: 'JPY', timezone: 'Asia/Tokyo',           tzLabel: 'Japan (GMT+9:00)' },
  'South Korea':    { currency: 'KRW', timezone: 'Asia/Seoul',           tzLabel: 'South Korea (GMT+9:00)' },
  'China':          { currency: 'CNY', timezone: 'Asia/Shanghai',        tzLabel: 'China (GMT+8:00)' },
  'Hong Kong':      { currency: 'HKD', timezone: 'Asia/Hong_Kong',       tzLabel: 'Hong Kong (GMT+8:00)' },
  'Taiwan':         { currency: 'TWD', timezone: 'Asia/Taipei',          tzLabel: 'Taiwan (GMT+8:00)' },
  // Europe
  'United Kingdom': { currency: 'GBP', timezone: 'Europe/London',        tzLabel: 'UK (GMT+0:00)' },
  'Germany':        { currency: 'EUR', timezone: 'Europe/Berlin',        tzLabel: 'Germany (GMT+1:00)' },
  'France':         { currency: 'EUR', timezone: 'Europe/Paris',         tzLabel: 'France (GMT+1:00)' },
  'Italy':          { currency: 'EUR', timezone: 'Europe/Rome',          tzLabel: 'Italy (GMT+1:00)' },
  'Spain':          { currency: 'EUR', timezone: 'Europe/Madrid',        tzLabel: 'Spain (GMT+1:00)' },
  'Portugal':       { currency: 'EUR', timezone: 'Europe/Lisbon',        tzLabel: 'Portugal (GMT+0:00)' },
  'Netherlands':    { currency: 'EUR', timezone: 'Europe/Amsterdam',     tzLabel: 'Netherlands (GMT+1:00)' },
  'Belgium':        { currency: 'EUR', timezone: 'Europe/Brussels',      tzLabel: 'Belgium (GMT+1:00)' },
  'Switzerland':    { currency: 'CHF', timezone: 'Europe/Zurich',        tzLabel: 'Switzerland (GMT+1:00)' },
  'Austria':        { currency: 'EUR', timezone: 'Europe/Vienna',        tzLabel: 'Austria (GMT+1:00)' },
  'Sweden':         { currency: 'SEK', timezone: 'Europe/Stockholm',     tzLabel: 'Sweden (GMT+1:00)' },
  'Norway':         { currency: 'NOK', timezone: 'Europe/Oslo',          tzLabel: 'Norway (GMT+1:00)' },
  'Denmark':        { currency: 'DKK', timezone: 'Europe/Copenhagen',    tzLabel: 'Denmark (GMT+1:00)' },
  'Finland':        { currency: 'EUR', timezone: 'Europe/Helsinki',      tzLabel: 'Finland (GMT+2:00)' },
  'Ireland':        { currency: 'EUR', timezone: 'Europe/Dublin',        tzLabel: 'Ireland (GMT+0:00)' },
  'Greece':         { currency: 'EUR', timezone: 'Europe/Athens',        tzLabel: 'Greece (GMT+2:00)' },
  'Poland':         { currency: 'PLN', timezone: 'Europe/Warsaw',        tzLabel: 'Poland (GMT+1:00)' },
  'Czech Republic': { currency: 'CZK', timezone: 'Europe/Prague',        tzLabel: 'Czech Republic (GMT+1:00)' },
  'Romania':        { currency: 'RON', timezone: 'Europe/Bucharest',     tzLabel: 'Romania (GMT+2:00)' },
  'Hungary':        { currency: 'HUF', timezone: 'Europe/Budapest',      tzLabel: 'Hungary (GMT+1:00)' },
  'Russia':         { currency: 'RUB', timezone: 'Europe/Moscow',        tzLabel: 'Russia (GMT+3:00)' },
  // Americas
  'United States':  { currency: 'USD', timezone: 'America/New_York',     tzLabel: 'US Eastern (GMT-5:00)' },
  'Canada':         { currency: 'CAD', timezone: 'America/Toronto',      tzLabel: 'Canada Eastern (GMT-5:00)' },
  'Mexico':         { currency: 'MXN', timezone: 'America/Mexico_City',  tzLabel: 'Mexico (GMT-6:00)' },
  'Brazil':         { currency: 'BRL', timezone: 'America/Sao_Paulo',    tzLabel: 'Brazil (GMT-3:00)' },
  'Argentina':      { currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires', tzLabel: 'Argentina (GMT-3:00)' },
  'Colombia':       { currency: 'COP', timezone: 'America/Bogota',       tzLabel: 'Colombia (GMT-5:00)' },
  'Chile':          { currency: 'CLP', timezone: 'America/Santiago',     tzLabel: 'Chile (GMT-4:00)' },
  'Peru':           { currency: 'PEN', timezone: 'America/Lima',         tzLabel: 'Peru (GMT-5:00)' },
  // Africa
  'South Africa':   { currency: 'ZAR', timezone: 'Africa/Johannesburg',  tzLabel: 'South Africa (GMT+2:00)' },
  'Nigeria':        { currency: 'NGN', timezone: 'Africa/Lagos',         tzLabel: 'Nigeria (GMT+1:00)' },
  'Kenya':          { currency: 'KES', timezone: 'Africa/Nairobi',       tzLabel: 'Kenya (GMT+3:00)' },
  'Egypt':          { currency: 'EGP', timezone: 'Africa/Cairo',         tzLabel: 'Egypt (GMT+2:00)' },
  'Ghana':          { currency: 'GHS', timezone: 'Africa/Accra',         tzLabel: 'Ghana (GMT+0:00)' },
  'Tanzania':       { currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', tzLabel: 'Tanzania (GMT+3:00)' },
  'Ethiopia':       { currency: 'ETB', timezone: 'Africa/Addis_Ababa',   tzLabel: 'Ethiopia (GMT+3:00)' },
  'Morocco':        { currency: 'MAD', timezone: 'Africa/Casablanca',    tzLabel: 'Morocco (GMT+1:00)' },
  // Oceania
  'Australia':      { currency: 'AUD', timezone: 'Australia/Sydney',     tzLabel: 'Australia Eastern (GMT+10:00)' },
  'New Zealand':    { currency: 'NZD', timezone: 'Pacific/Auckland',     tzLabel: 'New Zealand (GMT+12:00)' },
  'Fiji':           { currency: 'FJD', timezone: 'Pacific/Fiji',         tzLabel: 'Fiji (GMT+12:00)' },
};

const COUNTRY_OPTIONS = Object.keys(COUNTRY_DATA).map(c => ({ value: c, label: c }));
COUNTRY_OPTIONS.push({ value: 'Others', label: 'Others' });

// Build timezone options from all known countries
const TIMEZONE_OPTIONS = (() => {
  const seen = new Set();
  const opts = [];
  Object.entries(COUNTRY_DATA).forEach(([, data]) => {
    if (!seen.has(data.timezone)) {
      seen.add(data.timezone);
      opts.push({ value: data.timezone, label: data.tzLabel });
    }
  });
  // Add extra US timezones
  const extras = [
    { value: 'America/Chicago',      label: 'US Central (GMT-6:00)' },
    { value: 'America/Denver',       label: 'US Mountain (GMT-7:00)' },
    { value: 'America/Los_Angeles',  label: 'US Pacific (GMT-8:00)' },
    { value: 'America/Anchorage',    label: 'US Alaska (GMT-9:00)' },
    { value: 'Pacific/Honolulu',     label: 'US Hawaii (GMT-10:00)' },
    { value: 'America/Vancouver',    label: 'Canada Pacific (GMT-8:00)' },
    { value: 'America/Edmonton',     label: 'Canada Mountain (GMT-7:00)' },
    { value: 'America/Winnipeg',     label: 'Canada Central (GMT-6:00)' },
    { value: 'Australia/Perth',      label: 'Australia Western (GMT+8:00)' },
    { value: 'Australia/Adelaide',   label: 'Australia Central (GMT+9:30)' },
  ];
  extras.forEach(e => { if (!seen.has(e.value)) { seen.add(e.value); opts.push(e); } });
  // Sort by GMT offset for easy browsing
  opts.sort((a, b) => {
    const extractOffset = (label) => {
      const m = label.match(/GMT([+-]\d+:\d+)/);
      if (!m) return 0;
      const [h, min] = m[1].split(':').map(Number);
      return h + (h < 0 ? -(min / 60) : min / 60);
    };
    return extractOffset(a.label) - extractOffset(b.label);
  });
  return opts;
})();

const LANGUAGE_OPTIONS = [
  { value: 'English',    label: 'English' },
  { value: 'Arabic',     label: 'Arabic (العربية)' },
  { value: 'Hindi',      label: 'Hindi (हिन्दी)' },
  { value: 'Spanish',    label: 'Spanish (Español)' },
  { value: 'French',     label: 'French (Français)' },
  { value: 'German',     label: 'German (Deutsch)' },
  { value: 'Portuguese', label: 'Portuguese (Português)' },
  { value: 'Chinese',    label: 'Chinese (中文)' },
  { value: 'Japanese',   label: 'Japanese (日本語)' },
  { value: 'Korean',     label: 'Korean (한국어)' },
  { value: 'Thai',       label: 'Thai (ไทย)' },
  { value: 'Malay',      label: 'Malay (Bahasa Melayu)' },
  { value: 'Turkish',    label: 'Turkish (Türkçe)' },
  { value: 'Russian',    label: 'Russian (Русский)' },
  { value: 'Swahili',    label: 'Swahili' },
];


export default function ClientProfilePage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <ClientProfileContent />
    </RoleGate>
  );
}

function ClientProfileContent() {
  const { email, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // States for Security & Mode
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passMessage, setPassMessage] = useState(null);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    country: '',
    posType: '',
    gstNumber: '',
    fssaiNumber: '',
    website: '',
    currency: 'INR',
    logoUrl: '',
    brandColor: '#f97316',
    timezone: 'Asia/Kolkata',
    primaryLanguage: 'English',
    instagramUrl: '',
    facebookUrl: '',
    whatsappNumber: '',
    bankName: '',
    accountNumber: '',
    ifscCode: ''
  });

  useEffect(() => {
    fetchClient();
  }, []);

  const fetchClient = async () => {
    try {
      const resp = await api.get('/api/v1/clients/me');
      if (resp.data.success) {
        const data = resp.data.data;
        // Normalize legacy timezone formats (e.g. "UTC+5:30 (India)") to IANA IDs
        const rawTz = data.timezone || '';
        const normalizedTz = resolveTimezone(rawTz);
        // Resolve currency from country data if not set
        const cd = COUNTRY_DATA[data.country];
        setFormData({
          id: data.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          country: data.country || '',
          posType: data.posType || '',
          gstNumber: data.gstNumber || '',
          fssaiNumber: data.fssaiNumber || '',
          website: data.website || '',
          currency: data.currency || (cd ? cd.currency : 'USD'),
          logoUrl: data.logoUrl || '',
          brandColor: data.brandColor || '#f97316',
          timezone: normalizedTz,
          primaryLanguage: data.primaryLanguage || 'English',
          instagramUrl: data.instagramUrl || '',
          facebookUrl: data.facebookUrl || '',
          whatsappNumber: data.whatsappNumber || '',
          bankName: data.bankName || '',
          accountNumber: data.accountNumber || '',
          ifscCode: data.ifscCode || ''
        });
      } else {
        setMsgType('error');
        setMessage("Could not load profile.");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setMsgType('error');
      setMessage("Connection error.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/png', 0.9);
        setFormData(prev => ({ ...prev, logoUrl: base64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    
    try {
      const resp = await api.put(`/api/v1/clients/${formData.id}`, formData);
      
      if (resp.data.success) {
        setMsgType('success');
        setMessage("Global business details updated!");
        setIsEditing(false);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(resp.data.message || "Failed to update profile info");
      }
    } catch (err) {
      setMsgType('error');
      setMessage(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPassMessage({ type: 'wait', text: 'Processing...' });
    
    try {
      const resp = await api.post('/api/v1/auth/change-password', { email, currentPassword, newPassword });
      if (resp.data.success) {
        setPassMessage({ type: 'success', text: 'Password updated!' });
        setCurrentPassword('');
        setNewPassword('');
        setTimeout(() => setPassMessage(null), 4000);
      } else {
        throw new Error(resp.data.message || 'Password update failed');
      }
    } catch (err) {
      setPassMessage({ type: 'error', text: err.response?.data?.message || err.message });
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-set currency & timezone when country changes
      if (field === 'country' && COUNTRY_DATA[value]) {
        const cd = COUNTRY_DATA[value];
        updated.currency = cd.currency;
        updated.timezone = cd.timezone;
      }
      return updated;
    });
  };

  const isFoodBusiness = ['Cafe', 'Restaurant', 'QSR', 'Bakery'].includes(formData.posType);

  if (loading) return <div className="loading-state">Loading business data...</div>;

  return (
    <DashboardLayout title="Client Management" showBack={true}>
      <div className="profile-wrapper">
        <div className="profile-top-bar">
          <div className="business-summary">
            <div className="biz-avatar">
              <FaIdCard />
            </div>
            <div className="biz-meta">
               <h2>{formData.name || 'Set Business Name'}</h2>
               <span>{formData.posType} • {formData.country}</span>
            </div>
          </div>
          <div className="top-actions">
             {isEditing || isChangingPassword ? (
               <button className="cancel-btn" onClick={() => { setIsEditing(false); setIsChangingPassword(false); }}>
                 <FaTimes /> Cancel
               </button>
             ) : (
               <button className="edit-btn" onClick={() => setIsEditing(true)}>
                 <FaEdit /> Edit Profile
               </button>
             )}
          </div>
        </div>

        {isEditing ? (
          <div className="edit-view-container single-column">
            <form onSubmit={handleSubmit} className="compact-form">
              <div className="form-grid">
                <div className="grid-section">
                  <div className="section-header"><FaUserCircle /> Global Identity</div>
                  <div className="field-group">
                    <label>Legal Business Name <span style={{color:'red'}}>*</span></label>
                    <input value={formData.name} onChange={e => handleChange('name', e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label>Primary Business Type</label>
                    <NiceSelect 
                      options={[{value:'Cafe',label:'Cafe'},{value:'Restaurant',label:'Restaurant'},{value:'QSR',label:'QSR'},{value:'Bar',label:'Bar'},{value:'Bakery',label:'Bakery'},{value:'Others',label:'Others'}]}
                      value={formData.posType}
                      onChange={val => handleChange('posType', val)}
                    />
                  </div>
                </div>

                <div className="grid-section">
                  <div className="section-header"><FaGlobe /> Contact & Registration</div>
                  <div className="field-row">
                    <div className="field-group">
                      <label>Country / Region <span style={{color:'red'}}>*</span></label>
                      <NiceSelect 
                        options={COUNTRY_OPTIONS}
                        value={formData.country}
                        onChange={val => handleChange('country', val)}
                      />
                    </div>
                    <div className="field-group">
                      <label>Base Currency</label>
                      <input placeholder="INR" value={formData.currency} onChange={e => handleChange('currency', e.target.value)} />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field-group">
                      <label>Primary Phone <span style={{color:'red'}}>*</span></label>
                      <input value={formData.phone} onChange={e => handleChange('phone', e.target.value)} />
                    </div>
                    <div className="field-group">
                      <label>Corporate Website</label>
                      <input value={formData.website} onChange={e => handleChange('website', e.target.value)} />
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Global GST / Tax Number</label>
                    <input value={formData.gstNumber} onChange={e => handleChange('gstNumber', e.target.value)} />
                  </div>
                  {isFoodBusiness && (
                    <div className="field-group">
                      <label>FSSAI License (Global)</label>
                      <input value={formData.fssaiNumber} onChange={e => handleChange('fssaiNumber', e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="grid-section">
                  <div className="section-header"><FaPalette /> Branding & UI</div>
                  <div className="field-group">
                    <label>Global Logo (Grayscale Applied)</label>
                    <div className="logo-upload-wrapper">
                      {formData.logoUrl && (
                        <div className="logo-edit-preview">
                          <img src={formData.logoUrl} alt="Logo Preview" />
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, logoUrl: '' }))} className="remove-logo-btn"><FaTimes /></button>
                        </div>
                      )}
                      <label className="file-input-label">
                        <FaImage /> {formData.logoUrl ? "Change Logo" : "Upload PNG/JPG"}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} hidden />
                      </label>
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Brand Primary Color</label>
                    <div className="color-picker-group" style={{ display: 'flex', gap: '8px' }}>
                      <input type="color" value={formData.brandColor} onChange={e => handleChange('brandColor', e.target.value)} style={{ width: '45px', padding: '2px' }} />
                      <input value={formData.brandColor} onChange={e => handleChange('brandColor', e.target.value)} style={{ flex: 1 }} />
                    </div>
                  </div>
                </div>

                <div className="grid-section">
                  <div className="section-header"><FaClock /> Operational Context</div>
                  <div className="field-row">
                    <div className="field-group">
                      <label>Global Timezone</label>
                      <NiceSelect 
                        options={TIMEZONE_OPTIONS}
                        value={formData.timezone}
                        onChange={val => handleChange('timezone', val)}
                      />
                    </div>
                    <div className="field-group">
                      <label>Primary Language</label>
                      <NiceSelect 
                        options={LANGUAGE_OPTIONS}
                        value={formData.primaryLanguage}
                        onChange={val => handleChange('primaryLanguage', val)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid-section">
                  <div className="section-header"><FaInstagram /> Social & Engagement</div>
                  <div className="field-row">
                    <div className="field-group">
                      <label>Instagram URL</label>
                      <input value={formData.instagramUrl} onChange={e => handleChange('instagramUrl', e.target.value)} placeholder="instagram.com/yourbiz" />
                    </div>
                    <div className="field-group">
                      <label>WhatsApp Business</label>
                      <input value={formData.whatsappNumber} onChange={e => handleChange('whatsappNumber', e.target.value)} placeholder="+91 98765 43210" />
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Facebook Page</label>
                    <input value={formData.facebookUrl} onChange={e => handleChange('facebookUrl', e.target.value)} placeholder="facebook.com/yourbiz" />
                  </div>
                </div>

                <div className="grid-section">
                  <div className="section-header"><FaUniversity /> Financial Settlements</div>
                  <div className="field-group">
                    <label>Bank Name</label>
                    <input value={formData.bankName} onChange={e => handleChange('bankName', e.target.value)} placeholder="e.g. HDFC Bank" />
                  </div>
                  <div className="field-row">
                    <div className="field-group">
                      <label>Account Number</label>
                      <input value={formData.accountNumber} onChange={e => handleChange('accountNumber', e.target.value)} placeholder="Account No." />
                    </div>
                    <div className="field-group">
                      <label>IFSC / SWIFT</label>
                      <input value={formData.ifscCode} onChange={e => handleChange('ifscCode', e.target.value)} placeholder="IFSC Code" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-footer">
                 {message && <span className={`status-msg ${msgType}`}>{message}</span>}
                 <button type="submit" className="save-submit" disabled={saving}>
                   {saving ? "Updating..." : <><FaSave /> Save Global Details</>}
                 </button>
              </div>
            </form>
          </div>
        ) : isChangingPassword ? (
          <div className="edit-view-container security-focus">
             <div className="security-panel full-width-panel">
                <div className="section-header"><FaLock /> Update Account Security</div>
                <p className="section-desc">Keep your main account safe by updating your password regularly.</p>
                <form onSubmit={handlePasswordChange} className="password-form">
                   <div className="field-row">
                      <div className="field-group">
                         <label>Current Password <span style={{color:'red'}}>*</span></label>
                         <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                      </div>
                      <div className="field-group">
                         <label>New Password <span style={{color:'red'}}>*</span></label>
                         <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
                      </div>
                   </div>
                   <div className="security-footer">
                      <button type="submit" className="update-pass-btn">Change Password</button>
                      <button type="button" onClick={() => setIsChangingPassword(false)} className="cancel-btn">Back to Profile</button>
                   </div>
                   {passMessage && <div className={`pass-status ${passMessage.type}`}>{passMessage.text}</div>}
                </form>
             </div>
          </div>
        ) : (
          <div className="view-mode-grid">
             <div className="info-card">
               <div className="card-lbl">Primary Contact</div>
               <div className="info-rows">
                  <div className="info-row"><b>Admin Email:</b> <span>{formData.email}</span></div>
                  <div className="info-row"><b>Contact Phone:</b> <span>{formData.phone || 'Not set'}</span></div>
                  <div className="info-row"><b>Corporate Web:</b> <a href={formData.website} target="_blank" rel="noreferrer">{formData.website || 'None'}</a></div>
               </div>
             </div>

             <div className="info-card">
               <div className="card-lbl">Legal Identity</div>
               <div className="info-rows">
                  <div className="info-row"><b>Category:</b> <span>{formData.posType}</span></div>
                  <div className="info-row"><b>Region:</b> <span>{formData.country}</span></div>
                  <div className="info-row"><b>Currency:</b> <span>{formData.currency}</span></div>
               </div>
             </div>

             <div className="info-card large-card">
               <div className="card-lbl">Global Compliance</div>
               <div className="info-rows">
                  <div className="info-row"><b>GST Number:</b> <span>{formData.gstNumber || 'N/A'}</span></div>
                  {isFoodBusiness && <div className="info-row"><b>FSSAI Global:</b> <span>{formData.fssaiNumber || 'N/A'}</span></div>}
               </div>
               
               <div className="hz-divider"></div>
               
               <div className="card-lbl">Banking Details (Settlements)</div>
               <div className="info-rows">
                  <div className="info-row"><b>Bank Name:</b> <span>{formData.bankName || 'N/A'}</span></div>
                  <div className="info-row"><b>Account No:</b> <span>{formData.accountNumber || 'N/A'}</span></div>
                  <div className="info-row"><b>IFSC Code:</b> <span>{formData.ifscCode || 'N/A'}</span></div>
               </div>
             </div>

             <div className="info-card">
                <div className="card-lbl">Branding & Identity</div>
                <div className="branding-preview">
                   {formData.logoUrl ? (
                     <img src={formData.logoUrl} alt="Business Logo" className="preview-logo" />
                   ) : (
                     <div className="no-logo">No Global Logo</div>
                   )}
                   <div className="color-swatch-row">
                      <b>Primary Color:</b>
                      <div className="swatch" style={{ background: formData.brandColor }}></div>
                      <span>{formData.brandColor}</span>
                   </div>
                </div>
             </div>

             <div className="info-card">
                <div className="card-lbl">Global Settings</div>
                <div className="info-rows">
                   <div className="info-row"><b>Timezone:</b> <span>{formData.timezone}</span></div>
                   <div className="info-row"><b>Language:</b> <span>{formData.primaryLanguage}</span></div>
                </div>
             </div>

             <div className="info-card">
                <div className="card-lbl">Social Presence</div>
                <div className="info-rows">
                   <div className="info-row"><b>Instagram:</b> <span>{formData.instagramUrl || 'Not set'}</span></div>
                   <div className="info-row"><b>Facebook:</b> <span>{formData.facebookUrl || 'Not set'}</span></div>
                   <div className="info-row"><b>WhatsApp:</b> <span>{formData.whatsappNumber || 'Not set'}</span></div>
                </div>
             </div>

             <div className="info-card">
                <div className="card-lbl">Account Security</div>
                <div className="security-action-box">
                   <button onClick={() => setIsChangingPassword(true)} className="change-pass-trigger">
                      <FaLock /> Update Main Password
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .profile-wrapper { width: 100%; }
        
        .profile-top-bar { 
          display: flex; justify-content: space-between; align-items: center; 
          background: white; padding: 24px 32px; border-radius: 20px; border: 1px solid #e2e8f0; margin-bottom: 24px;
        }
        .business-summary { display: flex; align-items: center; gap: 20px; }
        .biz-avatar { width: 56px; height: 56px; background: #f8fafc; color: #f97316; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 26px; border: 1px solid #f1f5f9; }
        .biz-meta h2 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
        .biz-meta span { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

        .top-actions { display: flex; gap: 12px; }
        .edit-btn { background: #f97316; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 10px; cursor: pointer; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2); }
        .cancel-btn { background: #fff; color: #64748b; border: 1px solid #e2e8f0; padding: 12px 24px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 10px; cursor: pointer; }

        .view-mode-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 24px; }
        .info-card { background: white; padding: 28px; border-radius: 24px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; }
        .large-card { grid-row: span 2; }
        .card-lbl { font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 16px; letter-spacing: 1px; }
        .info-rows { display: flex; flex-direction: column; gap: 14px; }
        .info-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f8fafc; padding-bottom: 10px; font-size: 14px; }
        .info-row b { color: #64748b; font-weight: 600; }
        .info-row span, .info-row a { color: #0f172a; font-weight: 700; text-decoration: none; }
        .info-row a:hover { color: #f97316; }
        .hz-divider { height: 1px; background: #f1f5f9; margin: 20px 0; }

        .branding-preview { display: flex; flex-direction: column; gap: 16px; align-items: center; }
        .preview-logo { max-width: 140px; max-height: 80px; object-fit: contain; }
        .no-logo { padding: 20px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; font-size: 12px; font-weight: 700; color: #94a3b8; }
        .color-swatch-row { display: flex; align-items: center; gap: 12px; font-size: 14px; }
        .swatch { width: 32px; height: 32px; border-radius: 8px; border: 2px solid #fff; box-shadow: 0 0 0 1px #e2e8f0; }

        .logo-upload-wrapper { display: flex; align-items: center; gap: 20px; margin-top: 8px; }
        .logo-edit-preview { position: relative; width: 60px; height: 60px; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
        .logo-edit-preview img { width: 100%; height: 100%; object-fit: contain; }
        .remove-logo-btn { position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.5); color: white; border: none; font-size: 10px; cursor: pointer; padding: 4px; }
        .file-input-label { background: #f8fafc; color: #1e293b; border: 1.5px dashed #cbd5e1; padding: 12px 20px; border-radius: 12px; font-weight: 700; font-size: 13px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
        .file-input-label:hover { border-color: #f97316; color: #f97316; }

        .edit-view-container { display: grid; grid-template-columns: 1fr 340px; gap: 24px; }
        .edit-view-container.single-column { grid-template-columns: 1fr; }
        .compact-form { background: white; padding: 32px; border-radius: 24px; border: 1px solid #e2e8f0; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .section-header { font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 18px; display: flex; align-items: center; gap: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        .grid-section { display: flex; flex-direction: column; gap: 16px; }
        .field-group { display: flex; flex-direction: column; gap: 6px; }
        .field-group label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; }
        .field-group input, .field-group textarea { padding: 10px 14px; border-radius: 10px; border: 1px solid #e2e8f0; font-family: inherit; font-size: 14px; font-weight: 600; color: #000; transition: all 0.2s; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .security-focus { justify-content: center; }
        .full-width-panel { grid-column: 1 / -1; max-width: 800px; margin: 0 auto; width: 100%; background: white !important; padding: 40px !important; border-radius: 24px; border: 1px solid #e2e8f0; }
        .section-desc { font-size: 14px; color: #64748b; margin-bottom: 32px; font-weight: 500; }
        .password-form { display: flex; flex-direction: column; gap: 16px; }
        .security-footer { display: flex; gap: 16px; margin-top: 10px; }
        .update-pass-btn { background: #1e293b; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; }
        .pass-status { font-size: 12px; font-weight: 700; text-align: center; margin-top: 10px; }
        .pass-status.success { color: #16a34a; }
        .pass-status.error { color: #ef4444; }

        .security-action-box { display: flex; justify-content: center; padding: 10px 0; }
        .change-pass-trigger { background: #f8fafc; border: 1.5px dashed #cbd5e1; color: #1e293b; padding: 14px 24px; border-radius: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.2s; width: 100%; justify-content: center; }
        .change-pass-trigger:hover { border-color: #f97316; color: #f97316; background: #fff7ed; }

        .form-footer { margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; display: flex; justify-content: flex-end; align-items: center; gap: 20px; }
        .save-submit { background: #1e293b; color: white; border: none; padding: 14px 40px; border-radius: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.2s; }
        .save-submit:hover { background: #000; transform: translateY(-1px); }
        .status-msg { font-size: 13px; font-weight: 700; }
        .status-msg.success { color: #16a34a; }
        .status-msg.error { color: #ef4444; }

        .loading-state { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }

        @media (max-width: 1024px) {
          .edit-view-container { grid-template-columns: 1fr; }
          .view-mode-grid { grid-template-columns: 1fr; }
          .form-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 640px) {
           .profile-top-bar { flex-direction: column; align-items: flex-start; gap: 20px; padding: 20px; }
           .business-summary { gap: 12px; }
           .biz-avatar { width: 44px; height: 44px; font-size: 20px; }
           .biz-meta h2 { font-size: 18px; }
           .compact-form { padding: 20px; }
           .field-row { grid-template-columns: 1fr; }
           .top-actions { width: 100%; }
           .edit-btn, .cancel-btn { width: 100%; justify-content: center; }
           .save-submit { width: 100%; justify-content: center; }
        }
      `}</style>
    </DashboardLayout>
  );
}
