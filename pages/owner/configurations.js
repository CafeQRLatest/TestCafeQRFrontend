// pages/owner/configurations.js — Enterprise POS Configuration Engine
// SUPER_ADMIN only | Responsive | Modern Segmented Tabs | Centered Layout

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import PrinterSetupCard from '../../components/PrinterSetupCard';
import { fileToBitmapGrid } from '../../utils/logoBitmap';
import {
  FaSave, FaCheckCircle, FaExclamationCircle,
  FaBolt, FaReceipt, FaCalculator, FaPrint,
  FaSearch, FaCreditCard, FaCamera, FaBook, FaChair,
  FaQrcode, FaBoxes, FaIndustry, FaUsers,
  FaTags, FaUtensils, FaTruck, FaUserFriends,
  FaPlus, FaTimes
} from 'react-icons/fa';

// ═════════════════════════════════════════════════════════════════════════════
// TABS
// ═════════════════════════════════════════════════════════════════════════════

const TABS = [
  { key: 'modules',  label: 'Power Modules',    icon: <FaBolt />,       mobileLabel: 'Modules' },
  { key: 'tax',      label: 'Tax Rules',        icon: <FaReceipt />,    mobileLabel: 'Tax' },
  { key: 'roundoff', label: 'Round-off',        icon: <FaCalculator />, mobileLabel: 'Round-off' },
  { key: 'print',    label: 'Receipts',         icon: <FaPrint />,      mobileLabel: 'Receipts' },
  { key: 'hardware', label: 'Hardware',         icon: <FaPrint />,      mobileLabel: 'Hardware' },
];

// ═════════════════════════════════════════════════════════════════════════════
// MODULES
// ═════════════════════════════════════════════════════════════════════════════

const MODULES = [
  { key: 'pm_online_payment',   icon: <FaCreditCard />,  title: 'Online Payment',    desc: 'Allow Razorpay on customer app',            color: '#6366f1' },
  { key: 'pm_menu_images',      icon: <FaCamera />,      title: 'Menu Images',       desc: 'Show product photos in menu',               color: '#ec4899' },
  { key: 'pm_credit_ledger',    icon: <FaBook />,        title: 'Credit Ledger',     desc: 'Manage customer tabs & credit',             color: '#14b8a6' },
  { key: 'pm_table_management', icon: <FaChair />,       title: 'Table Management',  desc: 'Manage floor plan & tables',                color: '#f59e0b' },
  { key: 'pm_qr_ordering',      icon: <FaQrcode />,      title: 'QR Ordering',       desc: 'QR codes for customer self-ordering',       color: '#8b5cf6' },
  { key: 'pm_inventory',        icon: <FaBoxes />,       title: 'Inventory',         desc: 'Stock tracking & management',               color: '#0ea5e9' },
  { key: 'pm_production',       icon: <FaIndustry />,    title: 'Production',        desc: 'Manufacturing pipeline',                    color: '#64748b' },
  { key: 'pm_customers',        icon: <FaUsers />,       title: 'Customers',         desc: 'Customer directory & profiles',             color: '#f97316' },
  { key: 'pm_loyalty',          icon: <FaTags />,        title: 'Loyalty',           desc: 'Points & rewards program',                  color: '#ef4444' },
  { key: 'pm_pos_product_listing', icon: <FaSearch />,   title: 'POS Product Listing', desc: 'Enable product grid in sales screen',       color: '#059669' },
  { key: 'pm_discount',         icon: <FaTags />,        title: 'Enable Discounts',  desc: 'Allow order and item discounts',            color: '#f59e0b' },
  { key: 'pm_send_to_kitchen',  icon: <FaUtensils />,    title: 'Send to Kitchen',   desc: 'Forward orders to kitchen display',         color: '#22c55e' },
  { key: 'pm_online_delivery',  icon: <FaTruck />,       title: 'Online Delivery',   desc: 'Enable delivery ordering',                  color: '#06b6d4' },
];

// ═════════════════════════════════════════════════════════════════════════════
// PAGE EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export default function ConfigurationsPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN']}>
      <ConfigurationsContent />
    </RoleGate>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTENT
// ═════════════════════════════════════════════════════════════════════════════

function ConfigurationsContent() {
  const { orgId, orgName } = useAuth();
  const hasBranchContext = Boolean(orgId && orgId !== '0');
  const configEndpoint = useMemo(
    () => (hasBranchContext ? `/api/v1/configurations/branch/${orgId}` : '/api/v1/configurations'),
    [hasBranchContext, orgId]
  );
  const [activeTab, setActiveTab] = useState('modules');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [message, setMessage]     = useState(null);
  const [msgType, setMsgType]     = useState('success');

  // UI State for Tax feature
  const [newRate, setNewRate]     = useState('');

  // ─── State ─────────────────────────────────────────────────────────────────

  const [config, setConfig] = useState({
    pm_online_payment: false, pm_menu_images: false, pm_credit_ledger: false,
    pm_table_management: false, pm_qr_ordering: false, pm_inventory: false,
    pm_production: false, pm_customers: false, pm_loyalty: false,
    pm_send_to_kitchen: false, pm_online_delivery: false, pm_allow_multi_customer: false,
    pm_customer_age: false,
    credit_allocation_mode: 'OLDEST_FIRST',
    
    tax_enabled: false,
    tax_label_global: 'GST',
    tax_rates: [
      { id: 't1', name: 'GST 5%', value: 5 },
      { id: 't2', name: 'GST 12%', value: 12 },
      { id: 't3', name: 'GST 18%', value: 18 }
    ],
    tax_default_id: 't1',
    tax_prices_include: false,
    tax_split_enabled: true,

    currency_symbol: '₹',
    currency_position: 'before',
    
    ro_enabled: false, ro_mode: 'automatic', ro_auto_factor: 1.0, ro_manual_limit: 10.0,
    bill_footer: '',
    pm_pos_product_listing: true,
    pm_discount: true,
    print_logo_bitmap: null, print_logo_cols: null, print_logo_rows: null,
    
    // Hardware & paper (New)
    paper_mm: '58',
    print_cols: 32,
    left_dots: 0,
    right_dots: 0,
    auto_cut: false,
    print_win_list_url: 'http://127.0.0.1:3333/printers',
    print_win_post_url: 'http://127.0.0.1:3333/printRaw',
  });

  const [taxName, setTaxName] = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoMsg, setLogoMsg]       = useState('');

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoSaving(true);
    setLogoMsg('');
    try {
      const { bitmap, cols, rows } = await fileToBitmapGrid(file);
      setConfig(prev => ({ ...prev, print_logo_bitmap: bitmap, print_logo_cols: cols, print_logo_rows: rows }));
      setLogoMsg('✓ Logo stored locally. Press Save to push to cloud.');
      setTimeout(() => setLogoMsg(''), 4000);
    } catch (err) {
      setLogoMsg('✗ ' + (err.message || String(err)));
    } finally {
      setLogoSaving(false);
      if (e.target) e.target.value = '';
    }
  };

  const clearLogo = (e) => {
    e.preventDefault(); e.stopPropagation();
    setConfig(prev => ({ ...prev, print_logo_bitmap: null, print_logo_cols: null, print_logo_rows: null }));
    setLogoMsg('✓ Logo removed. Press Save to confirm.');
    setTimeout(() => setLogoMsg(''), 4000);
  };

  // ─── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 5000); return () => clearTimeout(t); }
  }, [message]);

  // ─── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage(null);
      try {
        const resp = await api.get(configEndpoint);
        if (resp.data?.success && resp.data?.data) {
          const d = resp.data.data;
          
          let parsedRates = [
            { id: 't1', name: 'GST 5%', value: 5 },
            { id: 't2', name: 'GST 12%', value: 12 },
            { id: 't3', name: 'GST 18%', value: 18 }
          ];
          
          if (Array.isArray(d.taxRates) && d.taxRates.length > 0) {
            // Check if backend already sent objects or old flat numbers
            parsedRates = d.taxRates.map((r, i) => 
               typeof r === 'object' ? r : { id: `tr-${i}-${Date.now()}`, name: `${d.taxLabelGlobal || 'Tax'} ${r}%`, value: r }
            );
          }

          setConfig({
            pm_online_payment: !!d.onlinePaymentEnabled, pm_menu_images: !!d.menuImagesEnabled,
            pm_credit_ledger: !!d.creditEnabled, pm_table_management: !!d.tableManagementEnabled,
            pm_qr_ordering: d.qrOrderingEnabled !== false, pm_inventory: !!d.inventoryEnabled,
            pm_production: !!d.productionEnabled, pm_customers: !!d.customersEnabled,
            pm_loyalty: !!d.loyaltyEnabled, pm_send_to_kitchen: d.sendToKitchenEnabled !== false,
            pm_online_delivery: !!d.onlineDeliveryEnabled, pm_allow_multi_customer: false,
            pm_customer_age: false,
            credit_allocation_mode: d.creditAllocationMode || 'OLDEST_FIRST',
            
            tax_enabled: !!d.taxEnabled, 
            tax_label_global: d.taxLabelGlobal || 'GST',
            tax_rates: parsedRates,
            tax_default_id: d.taxDefaultId || (parsedRates[0]?.id || null),
            tax_prices_include: !!d.pricesIncludeTax, 
            tax_split_enabled: d.taxSplitEnabled !== false,

            currency_symbol: d.currencySymbol || '₹',
            currency_position: d.currencyPosition || 'before',

            ro_enabled: !!d.roundOffEnabled, ro_mode: d.roundOffMode || 'automatic',
            ro_auto_factor: d.roundOffAutoFactor ?? 1.0, ro_manual_limit: d.roundOffManualLimit ?? 10.0,
            bill_footer: d.billFooter || '',
            pm_pos_product_listing: d.posProductListingEnabled !== false,
            pm_discount: d.discountEnabled !== false,
            print_logo_bitmap: d.printLogoBitmap || null,
            print_logo_cols: d.printLogoCols || null,
            print_logo_rows: d.printLogoRows || null,
            
            paper_mm: d.paperMm || '58',
            print_cols: d.printCols || 32,
            left_dots: d.printLeftMarginDots || 0,
            right_dots: d.printRightMarginDots || 0,
            auto_cut: !!d.printAutoCut,
            print_win_list_url: d.printWinListUrl || 'http://127.0.0.1:3333/printers',
            print_win_post_url: d.printWinPostUrl || 'http://127.0.0.1:3333/printRaw',
          });
        }
      } catch (err) {
        setMsgType('error');
        setMessage(err.response?.data?.message || err.message || 'Failed to load configuration');
      }
      finally { setLoading(false); }
    })();
  }, [configEndpoint]);

  const toggle = useCallback((f) => setConfig(p => ({ ...p, [f]: !p[f] })), []);
  const set = useCallback((f, v) => setConfig(p => ({ ...p, [f]: v })), []);

  // Tax Array Handlers
  const addTaxRate = () => {
    const val = parseFloat(newRate);
    if (!isNaN(val) && val >= 0) {
      const newObj = {
        id: `tr-${Date.now()}`,
        name: taxName || `${config.tax_label_global} ${val}%`,
        value: val
      };
      setConfig(p => ({ ...p, tax_rates: [...p.tax_rates, newObj] }));
      setNewRate('');
      setTaxName('');
    }
  };

  const removeTaxRate = (id) => {
    setConfig(p => {
      const remaining = p.tax_rates.filter(r => r.id !== id);
      return {
        ...p,
        tax_rates: remaining,
        tax_default_id: p.tax_default_id === id ? (remaining[0]?.id || null) : p.tax_default_id
      };
    });
  };

  // ─── Save ──────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true); setMessage(null);
    try {
      const payload = {
        onlinePaymentEnabled: config.pm_online_payment, menuImagesEnabled: config.pm_menu_images,
        creditEnabled: config.pm_credit_ledger, tableManagementEnabled: config.pm_table_management,
        creditAllocationMode: config.credit_allocation_mode || 'OLDEST_FIRST',
        qrOrderingEnabled: config.pm_qr_ordering, inventoryEnabled: config.pm_inventory,
        productionEnabled: config.pm_production, customersEnabled: config.pm_customers,
        loyaltyEnabled: config.pm_loyalty, sendToKitchenEnabled: config.pm_send_to_kitchen,
        onlineDeliveryEnabled: config.pm_online_delivery, allowMultipleCustomersPerOrder: false,
        customerAgeEnabled: false,
        
        taxEnabled: config.tax_enabled, 
        taxLabelGlobal: config.tax_label_global,
        taxRates: config.tax_rates, // Sending the full objects now
        taxDefaultId: config.tax_default_id,
        pricesIncludeTax: config.tax_prices_include,
        taxSplitEnabled: config.tax_split_enabled,

        currencySymbol: config.currency_symbol,
        currencyPosition: config.currency_position,
        
        roundOffEnabled: config.ro_enabled, roundOffMode: config.ro_mode,
        roundOffAutoFactor: Number(config.ro_auto_factor), roundOffManualLimit: Number(config.ro_manual_limit),
        billFooter: config.bill_footer || '',
        posProductListingEnabled: config.pm_pos_product_listing,
        discountEnabled: config.pm_discount,
        printLogoBitmap: config.print_logo_bitmap,
        printLogoCols: config.print_logo_cols,
        printLogoRows: config.print_logo_rows,
      };
      const resp = await api.put(configEndpoint, payload);
      if (resp.data?.success) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('cafeqr_sales_config');
          Object.keys(localStorage)
            .filter((key) => key.startsWith('cafeqr_sales_config:'))
            .forEach((key) => localStorage.removeItem(key));
          window.dispatchEvent(new Event('cafeqr-config-updated'));
        }
        setMsgType('success');
        setMessage(hasBranchContext
          ? `Configuration saved for ${orgName || 'selected branch'}`
          : 'Default configuration saved successfully');
      }
      else throw new Error(resp.data?.message || 'Save failed');
    } catch (err) { setMsgType('error'); setMessage(err.response?.data?.message || err.message); }
    finally { setSaving(false); }
  }, [config, configEndpoint, hasBranchContext, orgName]);


  if (loading) {
    return (
      <DashboardLayout title="System Configurations" showBack={true}>
         <div className="loading-state">
            <div className="loader-box">
               <div className="spinner"></div>
               <p>Loading Engine...</p>
            </div>
         </div>
         <style jsx>{`
            .loading-state { height: 60vh; display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; }
            .loader-box { text-align: center; }
            .spinner { width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #f97316; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            p { color: #64748b; font-weight: 600; font-size: 15px; }
         `}</style>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="System Configurations" showBack={true}>
      <div className="config-container">
        
        {/* Segmented Control Tabs */}
        <div className="segmented-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`segmented-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label desktop-only">{tab.label}</span>
              <span className="tab-label mobile-only">{tab.mobileLabel}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="tab-content">
          
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB: POWER MODULES                                                */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'modules' && (
            <div className="fade-in">
              <div className="section-header">
                <h2>Power Modules</h2>
                <p>Activate specific business features required for your workflow.</p>
              </div>
              
              <div className="dense-grid">
                {MODULES.map(m => (
                  <div key={m.key} className={`module-wrapper ${config[m.key] ? 'is-active' : ''}`}>
                    <div className="menu-box" onClick={() => toggle(m.key)}>
                      <div className="box-icon" style={
                          config[m.key]
                            ? { background: `linear-gradient(135deg, ${m.color}, ${m.color}dd)`, color: 'white' }
                            : { background: `${m.color}18`, color: '#94a3b8' }
                      }>
                        {m.icon}
                      </div>
                      <div className="box-content">
                        <h3>{m.title}</h3>
                        <p>{m.desc}</p>
                      </div>
                      <div className={`toggle-switch ${config[m.key] ? 'on' : ''}`}>
                        <div className="toggle-thumb"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sub-config panels rendered BELOW the grid — cards stay uniform height */}
              {MODULES.map(m => {
                if (!config[m.key]) return null;
                const hasChildren = m.children && m.children.length > 0;
                const isCreditLedger = m.key === 'pm_credit_ledger';
                if (!hasChildren && !isCreditLedger) return null;
                return (
                  <div key={`sub-${m.key}`} className="subconfig-strip" style={{ borderLeftColor: m.color }}>
                    <div className="subconfig-strip-label" style={{ color: m.color }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, fontSize: 9, background: `${m.color}18`, color: m.color, marginRight: 6 }}>{m.icon}</span>
                      {m.title} Options
                    </div>
                    <div className="subconfig-strip-body">
                      {hasChildren && m.children.map(child => (
                        <div key={child.key} className="subconfig-row" onClick={e => { e.stopPropagation(); toggle(child.key); }}>
                          <div className="subconfig-row-text">
                            <strong>{child.title}</strong>
                            <span>{child.desc}</span>
                          </div>
                          <div className={`toggle-switch small ${config[child.key] ? 'on' : ''}`}>
                            <div className="toggle-thumb"></div>
                          </div>
                        </div>
                      ))}
                      {isCreditLedger && (
                        <div className="subconfig-row" onClick={e => e.stopPropagation()}>
                          <div className="subconfig-row-text">
                            <strong>Payment Allocation</strong>
                            <span>How credit payments are applied to unpaid invoices</span>
                          </div>
                          <div style={{ width: 160, flexShrink: 0 }}>
                            <NiceSelect
                              value={config.credit_allocation_mode}
                              onChange={v => set('credit_allocation_mode', v)}
                              options={[
                                { value: 'OLDEST_FIRST', label: 'Oldest First' },
                                { value: 'MANUAL', label: 'Manual' },
                              ]}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB: TAX & COMPLIANCE                                             */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'tax' && (
            <div className="fade-in tax-screen-container">
               <div className="section-header">
                <h2>Tax & Internationalization</h2>
                <p>Configure regional currency, global tax labels, and precise computation rules.</p>
              </div>

              <div className="tax-grid">
                <div className="tax-main-col">
                    <div className="form-card">
                        <div className="section-title-sm"><FaTags /> Locale & System</div>
                        <div className="locale-inputs">
                            <div className="input-group">
                                <label className="group-lbl">Currency Symbol</label>
                                <div className="symbol-input-row">
                                    <input value={config.currency_symbol} onChange={e => set('currency_symbol', e.target.value)} className="form-input" style={{ width: '80px', textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }} />
                                    <NiceSelect 
                                        value={config.currency_position} 
                                        onChange={v => set('currency_position', v)}
                                        options={[{value:'before', label:'Before (e.g. $10)'}, {value:'after', label:'After (e.g. 10€)'}]}
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="group-lbl">Global Tax Label</label>
                                <input value={config.tax_label_global} onChange={e => set('tax_label_global', e.target.value)} className="form-input" placeholder="e.g. GST, VAT, Tax" />
                                <span className="group-desc">Used on bills and reports globally.</span>
                            </div>
                        </div>
                    </div>

                    <div className="form-card" style={{ marginTop: '20px' }}>
                        <div className="form-row toggle-row banner-row" onClick={() => toggle('tax_enabled')}>
                            <div className="row-icon"><FaReceipt /></div>
                            <div className="row-info">
                                <label>Enable {config.tax_label_global} Computations</label>
                                <span>Activate automatic tax logic for all generated bills</span>
                            </div>
                            <div className={`toggle-switch ${config.tax_enabled ? 'on' : ''}`}>
                                <div className="toggle-thumb"></div>
                            </div>
                        </div>

                        {config.tax_enabled && (
                            <div className="nested-forms animate-slide-down">
                                <div className="divider-line" />
                                
                                <label className="group-lbl" style={{ marginBottom: '12px' }}>Define {config.tax_label_global} Rules</label>
                                
                                <div className="tax-rules-list">
                                    {config.tax_rates.length === 0 && (
                                        <div className="empty-rules">No {config.tax_label_global} rules defined. Add one below.</div>
                                    )}
                                    {config.tax_rates.map(rule => (
                                        <div key={rule.id} className={`tax-rule-card ${config.tax_default_id === rule.id ? 'active' : ''}`} onClick={() => set('tax_default_id', rule.id)}>
                                            <div className="rule-main">
                                                <div className="rule-info">
                                                    <span className="rule-name">{rule.name}</span>
                                                    <span className="rule-rate">{rule.value}% Total</span>
                                                </div>
                                                {config.tax_default_id === rule.id && <span className="active-badge">DEFAULT</span>}
                                            </div>
                                            <button className="rule-del" onClick={(e) => { e.stopPropagation(); removeTaxRate(rule.id); }}><FaTimes /></button>
                                        </div>
                                    ))}
                                </div>

                                <div className="add-rule-form">
                                    <div className="add-rule-inputs">
                                        <input value={taxName} onChange={e => setTaxName(e.target.value)} className="form-input" placeholder="Rule Name (e.g. Local GST)" />
                                        <div className="rate-input-wrap">
                                            <input type="number" value={newRate} onChange={e => setNewRate(e.target.value)} className="form-input" placeholder="0.00" />
                                            <span className="perc-sign">%</span>
                                        </div>
                                    </div>
                                    <button className="btn-add-tax" onClick={addTaxRate}><FaPlus /> Add Rule</button>
                                </div>

                                <div className="divider-line" />

                                <div className="tax-logic-toggles">
                                    <div className="form-row toggle-row" onClick={() => toggle('tax_prices_include')}>
                                        <div className="row-info">
                                            <label>Prices Include {config.tax_label_global}</label>
                                            <span>(Inclusive) Tax is back-calculated from price</span>
                                        </div>
                                        <div className={`toggle-switch small ${config.tax_prices_include ? 'on' : ''}`}>
                                            <div className="toggle-thumb"></div>
                                        </div>
                                    </div>

                                    <div className="form-row toggle-row" onClick={() => toggle('tax_split_enabled')}>
                                        <div className="row-info">
                                            <label>Split {config.tax_label_global} on Receipt</label>
                                            <span>Show 50/50 components (e.g. C{config.tax_label_global} / S{config.tax_label_global})</span>
                                        </div>
                                        <div className={`toggle-switch small ${config.tax_split_enabled ? 'on' : ''}`}>
                                            <div className="toggle-thumb"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="tax-side-col">
                    <div className="simulator-card">
                        <div className="sim-title"><FaCalculator /> Real-time Simulation</div>
                        <p className="sim-desc">See how ₹100 is computed with your current settings.</p>
                        
                        {(() => {
                           const defaultRule = config.tax_rates.find(r => r.id === config.tax_default_id) || { value: 0 };
                           const rateVal = defaultRule.value;
                           const isInc = config.tax_prices_include;
                           const base = 100;
                           let itemPrice, taxAmt, total;

                           if (isInc) {
                               total = base;
                               taxAmt = base - (base / (1 + rateVal/100));
                               itemPrice = base - taxAmt;
                           } else {
                               itemPrice = base;
                               taxAmt = base * (rateVal/100);
                               total = base + taxAmt;
                           }

                           const fmt = (v) => v.toFixed(2);
                           const sym = config.currency_symbol;
                           const pos = config.currency_position;
                           const show = (v) => pos === 'before' ? `${sym}${v}` : `${v}${sym}`;

                           return (
                             <div className="sim-content">
                                <div className="sim-row">
                                    <span>Item Base Price</span>
                                    <strong>{show(fmt(itemPrice))}</strong>
                                </div>
                                <div className="sim-row active">
                                    <span>{config.tax_label_global} ({rateVal}%)</span>
                                    <strong>{show(fmt(taxAmt))}</strong>
                                </div>
                                {config.tax_split_enabled && (
                                    <div className="sim-split">
                                        <div className="split-row">└ C{config.tax_label_global} ({(rateVal/2)}%): {show(fmt(taxAmt/2))}</div>
                                        <div className="split-row">└ S{config.tax_label_global} ({(rateVal/2)}%): {show(fmt(taxAmt/2))}</div>
                                    </div>
                                )}
                                <div className="sim-divider" />
                                <div className="sim-row total">
                                    <span>Grand Total</span>
                                    <strong>{show(fmt(total))}</strong>
                                </div>
                                <div className="sim-badge">
                                    {isInc ? 'INCLUSIVE PRICING' : 'EXCLUSIVE PRICING'}
                                </div>
                             </div>
                           )
                        })()}
                    </div>

                    <div className="help-card">
                        <h5>Pro Tip</h5>
                        <p>Most Quick Service Restaurants (QSR) use <strong>Inclusive Pricing</strong> to keep menu prices simple for customers.</p>
                    </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB: ROUND-OFF                                                    */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'roundoff' && (
            <div className="fade-in">
              <div className="section-header">
                <h2>Round-off Engine</h2>
                <p>Configure automatic or manual bill rounding behavior.</p>
              </div>

              <div className="form-card">
                  <div className="form-row toggle-row banner-row" onClick={() => toggle('ro_enabled')}>
                    <div className="row-icon"><FaCalculator /></div>
                    <div className="row-info">
                       <label>Enable Round-off</label>
                       <span>Allow rounding adjustments on the final billing amount</span>
                    </div>
                    <div className={`toggle-switch ${config.ro_enabled ? 'on' : ''}`}>
                        <div className="toggle-thumb"></div>
                    </div>
                  </div>

                  {config.ro_enabled && (
                    <div className="nested-forms animate-slide-down">
                      <div className="input-group">
                        <label className="group-lbl">Mode of Operation</label>
                        <div style={{ maxWidth: '300px' }}>
                          <NiceSelect 
                             value={config.ro_mode} 
                             onChange={(v) => set('ro_mode', v)}
                             options={[
                               { value: 'automatic', label: 'Automatic (Always Run)' }, 
                               { value: 'manual', label: 'Manual (Cashier Discretion)' }
                             ]} 
                          />
                        </div>
                      </div>

                      {config.ro_mode === 'automatic' ? (
                        <div className="input-group">
                          <label className="group-lbl">Auto Rounding Factor</label>
                          <span className="group-desc">The multiple to round towards (e.g. 1.00 rounds ₹150.40 to ₹150.00)</span>
                          <div className="add-input-wrap" style={{ maxWidth: '200px' }}>
                            <span className="input-prefix">₹</span>
                            <input 
                              type="number" step="0.01" 
                              value={config.ro_auto_factor} 
                              onChange={(e) => set('ro_auto_factor', e.target.value)} 
                              placeholder="1.00"
                              className="form-input"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="input-group">
                          <label className="group-lbl">Maximum Manual Limit</label>
                          <span className="group-desc">The maximum allowed absolute Round-off value a cashier can apply</span>
                          <div className="add-input-wrap" style={{ maxWidth: '200px' }}>
                            <span className="input-prefix">₹</span>
                            <input 
                              type="number" step="0.01" 
                              value={config.ro_manual_limit} 
                              onChange={(e) => set('ro_manual_limit', e.target.value)} 
                              placeholder="10.00"
                              className="form-input"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB: PRINT & RECEIPT                                              */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'print' && (
             <div className="fade-in">
               <div className="section-header">
                <h2>Receipt Customization</h2>
                <p>Add personalized messages to your printed thermal receipts.</p>
              </div>

              <div className="form-card">
                 <div className="input-group">
                    <label className="group-lbl">Bill Footer Message</label>
                    <span className="group-desc">This text appears at the true bottom of the receipt. Used for greetings, terms, inputs.</span>
                    <textarea 
                       value={config.bill_footer} 
                       onChange={(e) => set('bill_footer', e.target.value)} 
                       placeholder="e.g. Thank you for your visit! Follow us on Instagram @CafeQR"
                       rows="4"
                       maxLength={200}
                       className="form-input form-textarea"
                    />
                 </div>

                 {config.bill_footer && (
                    <div className="receipt-preview-envelope">
                       <label className="preview-lbl">Preview Display</label>
                       <div className="receipt-preview-box">
                          <div className="receipt-dots top"></div>
                          <div className="receipt-content">
                             <div className="receipt-line">————————————</div>
                             <div className="receipt-msg">{config.bill_footer}</div>
                             <div className="receipt-line">————————————</div>
                          </div>
                          <div className="receipt-dots bottom"></div>
                       </div>
                    </div>
                 )}
              </div>

              {/* Receipt Logo Builder */}
              <div className="section-header" style={{ marginTop: '40px' }}>
                <h2>Receipt Logo</h2>
                <p>Upload a logo to appear at the top of printed thermal receipts.</p>
              </div>

              <div className="form-card">
                 <div className="input-group">
                     <label className="group-lbl">Upload Image</label>
                     <span className="group-desc">Supports JPG/PNG. Ideal width is max 380px.</span>
                     
                     <div className="logo-upload-zone" style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '16px', padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'white', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', flexShrink: 0 }}>
                          <FaCamera style={{ color: '#94a3b8', fontSize: '20px' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                           <input type="file" accept="image/*" onChange={handleLogoFile} disabled={logoSaving} style={{ display: 'none' }} id="logo-input" />
                           <label htmlFor="logo-input" style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', cursor: 'pointer', background: 'white', padding: '6px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
                             Choose Image File
                           </label>
                           {logoSaving && <span style={{ fontSize: 13, color: '#f97316', fontWeight: 600, marginLeft: '12px' }}>Processing into thermal raster...</span>}
                        </div>
                        {config.print_logo_bitmap && (
                           <button type="button" onClick={clearLogo} style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: '8px 16px', borderRadius: '8px' }}>
                              Clear Logo
                           </button>
                        )}
                     </div>
                     {logoMsg && (
                        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: logoMsg.startsWith('✗') ? '#dc2626' : '#10b981' }}>{logoMsg}</div>
                     )}
                     
                     {config.print_logo_bitmap && !logoMsg && (
                        <div style={{ marginTop: 16, fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                           <FaCheckCircle style={{ color: '#10b981' }}/>
                           Thermal Ready Grid ({config.print_logo_cols}px x {config.print_logo_rows}px)
                        </div>
                     )}
                 </div>
              </div>

             </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB: HARDWARE                                                     */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'hardware' && (
             <div className="fade-in">
                <div className="section-header">
                  <h2>Hardware Integration</h2>
                  <p>Define local device connections for thermal printers and order routing logic.</p>
                </div>
                
                <div className="hardware-wrapper">
                   <PrinterSetupCard 
                      restaurantId={null} 
                      config={config} 
                      onConfigChange={set} 
                   />
                </div>
             </div>
          )}
        </div>

        {/* ═══ Floating Save Component ═══ */}
        <div className="action-footer">
           <div className="action-footer-inner">
             {message && (
               <div className={`status-msg ${msgType}`}>
                 {msgType === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
                 {message}
               </div>
             )}
             <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? <div className="spinner-small" /> : <FaSave />}
                {saving ? 'Saving System Core...' : 'Save Configuration'}
             </button>
           </div>
        </div>

      </div>

      <style jsx>{`
        /* ─── BASE LAYOUT ─── */
        .config-container {
           width: 100%;
           padding: 24px 4px 120px;
           animation: fadeIn 0.4s ease;
        }
        @media (max-width: 1024px) { .config-container { padding: 32px 0 100px; } }
        @media (max-width: 768px) { .config-container { padding: 24px 0 100px; } }

        .fade-in { animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .config-header-main { margin-bottom: 40px; text-align: left; }
        .config-header-main h1 { margin: 0; font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: -0.03em; }
        .config-header-main p { margin: 8px 0 0; font-size: 16px; color: #64748b; font-weight: 500; max-width: 600px; }

        /* ─── MODERN SEGMENTED TABS ─── */
        .segmented-tabs {
           display: flex; gap: 8px;
           background: #f1f5f9;
           padding: 8px;
           border-radius: 16px;
           margin-bottom: 32px;
           overflow-x: auto;
           flex-wrap: nowrap;
           box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
           -webkit-overflow-scrolling: touch;
        }
        .segmented-tabs::-webkit-scrollbar { display: none; }
        
        .segmented-tab {
           flex: 1; min-width: max-content;
           display: flex; align-items: center; justify-content: center; gap: 10px;
           padding: 10px 16px;
           background: transparent; border: none; border-radius: 12px;
           font-size: 14px; font-weight: 700; color: #64748b;
           cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
           font-family: inherit;
        }
        .segmented-tab:hover:not(.active) { color: #334155; background: rgba(255,255,255,0.6); }
        .segmented-tab.active {
           background: white; color: #0f172a;
           box-shadow: 0 4px 16px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
           transform: translateY(-1px);
        }
        .tab-icon { font-size: 18px; }
        .mobile-only { display: none; }

        /* ─── SECTION HEADER ─── */
        .section-header { margin-bottom: 24px; padding-left: 4px; }
        .section-header h2 { margin: 0; font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: -0.02em; }
        .section-header p { margin: 6px 0 0; font-size: 15px; color: #64748b; font-weight: 500; }

        /* ─── CARDS & GRID ─── */
        .dense-grid { 
           display: grid; 
           grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); 
           gap: 12px; 
        }

        .module-wrapper {
           display: flex;
           flex-direction: column;
           justify-content: center;
           background: white;
           border: 1.5px solid #e2e8f0;
           border-radius: 16px;
           transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
           box-shadow: 0 2px 8px rgba(0,0,0,0.02);
           position: relative;
           min-height: 68px;
           height: 68px;
        }
        .module-wrapper:hover { border-color: #cbd5e1; box-shadow: 0 12px 28px rgba(0,0,0,0.05); transform: translateY(-2px); }
         .module-wrapper.is-active {
            border-color: #fed7aa; 
            box-shadow: 0 8px 32px rgba(249,115,22,0.08); /* Glow effect */
            background: linear-gradient(180deg, #ffffff 0%, #fffbf5 100%);
         }
         .module-wrapper.no-hover:hover {
            transform: none !important;
            border-color: #fed7aa !important;
            box-shadow: 0 8px 32px rgba(249,115,22,0.08) !important;
         }
         .small-select :global(.nice-select-trigger) {
            height: 34px !important;
            padding: 6px 12px !important;
            border-radius: 8px !important;
         }
         .small-select :global(.nice-select-trigger span) {
            font-size: 12.5px !important;
            font-weight: 600 !important;
         }
        
        .menu-box {
          padding: 12px;
          display: flex; align-items: center; gap: 12px;
          cursor: pointer; position: relative; z-index: 2;
        }
        
        .box-icon {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .is-active .box-icon {
           box-shadow: 0 8px 16px rgba(0,0,0,0.15), inset 0 2px 4px rgba(255,255,255,0.3);
           transform: scale(1.05); /* Make active icons pop beautifully */
        }
        
        .box-content { flex: 1; }
        .box-content h3 { margin: 0; font-size: 13.5px; font-weight: 800; color: #0f172a; transition: color 0.2s;}
        .box-content p { margin: 2px 0 0; font-size: 11.5px; color: #64748b; line-height: 1.3; font-weight: 500; }

        .sub-box {
           position: relative; z-index: 1;
           padding: 0 12px 12px 60px; /* Align with text perfectly */
           display: flex; align-items: center; justify-content: space-between; gap: 10px;
           animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
           cursor: pointer;
        }
        .sub-box:last-child {
           padding-bottom: 24px;
        }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

        .sub-connecting-line {
           position: absolute; left: 30px; top: -14px; bottom: 32px;
           width: 3px; background: #fed7aa; border-radius: 4px; z-index: 0;
        }
        .sub-box .box-content h3 { font-size: 12.5px; color: #334155; }
        .sub-box .box-content p { font-size: 11px; }

        /* ─── SUB-CONFIG STRIP ─── */
        .subconfig-strip {
           margin-top: 8px;
           background: white;
           border: 1.5px solid #e2e8f0;
           border-left-width: 3px;
           border-radius: 14px;
           overflow: hidden;
           animation: slideDown 0.22s cubic-bezier(0.16, 1, 0.3, 1);
           box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }
        .subconfig-strip-label {
           padding: 6px 14px;
           font-size: 9.5px;
           font-weight: 800;
           letter-spacing: 0.07em;
           text-transform: uppercase;
           background: #f8fafc;
           border-bottom: 1px solid #f1f5f9;
           display: flex;
           align-items: center;
        }
        .subconfig-strip-body {
           display: flex;
           flex-wrap: wrap;
        }
        .subconfig-row {
           flex: 1 1 260px;
           display: flex;
           align-items: center;
           justify-content: space-between;
           gap: 12px;
           padding: 10px 14px;
           cursor: pointer;
           border-right: 1px solid #f8fafc;
           border-bottom: 1px solid #f8fafc;
           transition: background 0.12s;
        }
        .subconfig-row:hover { background: #fafbfc; }
        .subconfig-row-text { flex: 1; min-width: 0; }
        .subconfig-row-text strong { display: block; font-size: 12px; font-weight: 700; color: #1e293b; }
        .subconfig-row-text span { display: block; font-size: 10.5px; color: #64748b; margin-top: 1px; font-weight: 500; }

        /* ─── FORM CARD ─── */
        .form-card {
           background: white; border-radius: 16px; border: 1px solid #e2e8f0;
           padding: 18px; box-shadow: 0 4px 16px rgba(0,0,0,0.02);
           display: flex; flex-direction: column; gap: 18px;
           max-width: 900px; /* Don't stretch simple forms to infinity */
        }
        .form-card.full-width { max-width: 100%; }

        .form-row.toggle-row {
           display: flex; align-items: center; justify-content: space-between;
           cursor: pointer; padding: 4px 0; gap: 16px;
        }
        .banner-row {
           background: #fafbfc; padding: 24px; border-radius: 16px; border: 1px solid #f1f5f9;
        }
        .banner-row:hover { border-color: #e2e8f0; }
        .row-icon {
           width: 48px; height: 48px; border-radius: 12px; background: #e0e7ff; color: #4f46e5;
           display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;
           box-shadow: inset 0 -2px 0 rgba(0,0,0,0.05);
        }
        .row-info { flex: 1; }
        .row-info label { display: block; font-size: 17px; font-weight: 800; color: #0f172a; cursor: pointer; margin: 0; }
        .row-info span { display: block; font-size: 14px; color: #64748b; margin-top: 6px; font-weight: 500; }

         .nested-forms {
            padding: 22px 24px;
            background: #f8fafc;
            border-radius: 16px;
            border: 1.5px solid #e2e8f0;
            border-left: 4px solid #f97316;
            margin-top: 16px;
            margin-left: 0;
            display: flex;
            flex-direction: column;
            gap: 22px;
         }

        /* ─── GROUP FIELDS REFINED ─── */
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        .group-lbl { font-size: 14px; font-weight: 800; color: #1e293b; margin:0;}
        .group-desc { font-size: 13px; color: #64748b; margin-top: -2px; margin-bottom: 4px; }

        .form-input {
           width: 100%; padding: 14px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px;
           font-size: 15px; color: #0f172a; font-family: inherit; transition: all 0.2s;
           background: #fafbfc;
        }
        .form-input:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 4px rgba(249,115,22,0.1); }
        .form-textarea { resize: vertical; line-height: 1.5; }

        .add-input-wrap { position: relative; display: flex; align-items: center; flex: 1;}
        .input-suffix { position: absolute; right: 16px; color: #94a3b8; font-weight: 700; pointer-events: none;}
        .input-prefix { position: absolute; left: 16px; color: #94a3b8; font-weight: 700; pointer-events: none;}
        .add-input-wrap .input-prefix ~ .form-input { padding-left: 36px; }

        .divider-line { display: block; height: 1px; background: #f1f5f9; margin: 0; }

        /* ─── TOGGLE ─── */
        .toggle-switch {
           width: 36px; height: 20px; background: #e2e8f0;
           border-radius: 99px; position: relative; transition: all 0.3s;
           flex-shrink: 0; cursor: pointer;
           box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);
        }
        .toggle-switch.on { background: #10b981; } /* Subtler green or keep f97316? Let's use f97316 */
        .toggle-switch.on { background: #f97316; }
        .toggle-thumb {
           width: 14px; height: 14px; background: white; border-radius: 50%;
           position: absolute; top: 3px; left: 3px; transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
           box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .toggle-switch.on .toggle-thumb { transform: translateX(16px); }
        .toggle-switch.small { width: 40px; height: 24px; }
        .toggle-switch.small .toggle-thumb { width: 16px; height: 16px; top: 4px; left: 4px; }
        .toggle-switch.small.on .toggle-thumb { transform: translateX(16px); }

        /* ─── TAX RATES TAGS ─── */
        .tax-tags-area {
           display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; padding: 12px;
           background: #fafbfc; border: 1px dashed #cbd5e1; border-radius: 12px; min-height: 56px;
        }
        .empty-state { color: #94a3b8; font-size: 13.5px; font-style: italic; display: flex; align-items: center; justify-content: center; width: 100%;}
        
        .tax-tag {
           display: inline-flex; align-items: center; gap: 8px;
           background: white; border: 1px solid #e2e8f0;
           padding: 6px 12px 6px 14px; border-radius: 99px; /* Pill shape */
           cursor: pointer; transition: all 0.2s;
           box-shadow: 0 2px 4px rgba(0,0,0,0.03);
        }
        .tax-tag.default-tag {
           background: #fffaf5; border-color: #f97316; box-shadow: 0 4px 10px rgba(249,115,22,0.15);
           transform: scale(1.02);
        }
        .tax-tag:hover:not(.default-tag) { border-color: #cbd5e1; box-shadow: 0 4px 8px rgba(0,0,0,0.05);}
        .rate-val { font-weight: 800; font-size: 15px; color: #1e293b; }
        .default-tag .rate-val { color: #ea580c; }
        .default-badge {
           font-size: 9px; font-weight: 900; background: #f97316; color: white;
           padding: 3px 8px; border-radius: 99px; letter-spacing: 0.05em;
        }
        .del-btn {
           background: #f1f5f9; border: none; font-size: 11px;
           color: #64748b; cursor: pointer; width: 22px; height: 22px;
           border-radius: 50%; display: flex; align-items: center; justify-content: center;
           transition: all 0.2s; margin-left: 4px;
        }
        .del-btn:hover { background: #fee2e2; color: #dc2626; }

        .add-rate-control {
           display: flex; gap: 12px; align-items: center; max-width: 340px; margin-top: 8px;
        }
        .text-lg { font-size: 16px !important; font-weight: 600; }
        
        .btn-secondary {
           background: #f1f5f9; color: #0f172a; border: none;
           padding: 14px 20px; border-radius: 10px; font-weight: 700; font-size: 14px;
           cursor: pointer; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 8px;
        }
        .btn-secondary:hover { background: #e2e8f0; }

        /* ─── RECEIPT PREVIEW ─── */
        .preview-lbl { font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: block; }
        .receipt-preview-envelope { margin-top: 8px; }
        .receipt-preview-box {
           background: white; border: 1px solid #e2e8f0; border-radius: 12px;
           max-width: 320px; overflow: hidden; box-shadow: 0 8px 16px rgba(0,0,0,0.04);
        }
        .receipt-dots { height: 8px; background: repeating-linear-gradient(90deg, #e2e8f0 0px, #e2e8f0 4px, transparent 4px, transparent 8px); }
        .receipt-content { padding: 24px 20px; text-align: center; }
        .receipt-line { color: #cbd5e1; font-size: 12px; letter-spacing: 2px; }
        .receipt-msg { font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: 600; color: #334155; white-space: pre-wrap; line-height: 1.6; margin: 12px 0; }

        /* ─── ACTION FOOTER ─── */
        .action-footer {
           position: fixed; bottom: 0; left: 0; right: 0;
           background: rgba(255,255,255,0.9); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
           border-top: 1px solid rgba(226, 232, 240, 0.8);
           z-index: 50; padding: 16px 32px; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        }
        .action-footer-inner {
           width: 100%;
           display: flex; justify-content: flex-end; align-items: center; gap: 20px;
        }
        .btn-primary {
           background: #f97316; color: white; border: none; padding: 16px 40px;
           border-radius: 14px; font-weight: 800; font-size: 16px; cursor: pointer;
           transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 8px 24px rgba(249,115,22,0.3);
           display: flex; align-items: center; gap: 10px; font-family: inherit;
        }
        .btn-primary:hover:not(:disabled) { background: #ea580c; transform: translateY(-2px); box-shadow: 0 12px 24px rgba(249,115,22,0.3); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

        .status-msg {
           display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px;
           padding: 10px 16px; border-radius: 10px; animation: fadeIn 0.3s;
        }
        .status-msg.success { background: #ecfdf5; color: #059669; }
        .status-msg.error { background: #fef2f2; color: #dc2626; }

        .spinner-small {
           width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.4);
           border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite;
        }

        /* ─── RESPONSIVE (CAPACITOR & MOBILE) ─── */
        @media (max-width: 768px) {
           .dense-grid { grid-template-columns: 1fr; }
           .action-footer-inner { justify-content: space-between; }
           .config-header-main h1 { font-size: 26px; }
           .segmented-tab { padding: 12px 16px; font-size: 14px; }
        }

        @media (max-width: 480px) {
           .config-header-main { margin-bottom: 24px; }
           .config-container { padding: 16px 12px 100px; padding-top: env(safe-area-inset-top, 16px); }
           .config-header-main h1 { font-size: 24px; }
           .config-header-main p { font-size: 14px; }
           
           .menu-box { padding: 16px; gap: 14px; border-radius: 14px; }
           .box-icon { width: 44px; height: 44px; font-size: 18px; }
           .box-content h3 { font-size: 15px; }
           .box-content p { font-size: 13px; }
           .sub-box { padding-left: 34px; padding-right: 16px; }
           .sub-connecting-line { left: 24px; bottom: 10px; }
           .sub-icon { width: 30px; height: 30px; font-size: 14px; }
           
           .desktop-only { display: none; }
           .mobile-only { display: inline; }
           .segmented-tabs { margin-bottom: 24px; border-radius: 12px; }
           .segmented-tab { padding: 10px 12px; font-size: 14px; gap: 6px; }
           
           .section-header h2 { font-size: 20px; }
           
           .form-card { padding: 20px 16px; border-radius: 16px; gap: 24px; }
           .banner-row { padding: 16px; border-radius: 12px; }
           .row-icon { display: none; } /* Reclaim real estate on mobile */
           .row-info label { font-size: 15px; }
           .nested-forms { padding-left: 14px; margin-left: 4px; gap: 24px; }
           
           .action-footer { padding: 12px 16px; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
           .action-footer-inner { flex-direction: column; align-items: stretch; gap: 12px; }
           .btn-primary { width: 100%; justify-content: center; padding: 16px; font-size: 16px; }
           .status-msg { justify-content: center; width: 100%; text-align: center; }
           
           .add-rate-control { max-width: 100%; flex-wrap: wrap; }
           .add-input-wrap { min-width: 150px; }
           .tax-tags-area { padding: 12px 10px; }
        }

        /* ─── NEW TAX & I18N STYLES ─── */
        .tax-grid { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; margin-top: 8px; }
        @media (max-width: 1150px) { .tax-grid { grid-template-columns: 1fr; } }
        
        .section-title-sm { font-size: 13px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
        
        .locale-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 640px) { .locale-inputs { grid-template-columns: 1fr; } }
        
        .symbol-input-row { display: flex; gap: 12px; align-items: center; }
        
        .tax-rules-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
        .tax-rule-card { 
            display: flex; align-items: center; justify-content: space-between; 
            padding: 18px 24px; background: #fafbfc; border: 1.5px solid #e2e8f0; border-radius: 16px; 
            cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tax-rule-card:hover { border-color: #cbd5e1; background: white; transform: translateX(4px); }
        .tax-rule-card.active { border-color: #f97316; background: #fffaf5; box-shadow: 0 8px 20px rgba(249,115,22,0.08); }
        
        .rule-main { display: flex; align-items: center; gap: 16px; flex: 1; }
        .rule-info { display: flex; flex-direction: column; gap: 2px; }
        .rule-name { font-size: 15.5px; font-weight: 800; color: #0f172a; }
        .rule-rate { font-size: 13.5px; color: #64748b; font-weight: 600; }
        .active-badge { font-size: 10px; font-weight: 900; background: #f97316; color: white; padding: 4px 10px; border-radius: 99px; letter-spacing: 0.02em; }
        
        .rule-del { 
            width: 36px; height: 36px; border-radius: 10px; border: none; background: transparent; 
            color: #94a3b8; display: flex; align-items: center; justify-content: center; 
            cursor: pointer; transition: all 0.2s; 
        }
        .rule-del:hover { background: #fee2e2; color: #ef4444; }

        .add-rule-form { background: #f8fafc; padding: 20px; border-radius: 16px; border: 1.5px dashed #e2e8f0; margin-bottom: 8px;}
        .add-rule-inputs { display: grid; grid-template-columns: 1fr 140px; gap: 12px; margin-bottom: 16px; }
        .rate-input-wrap { position: relative; display: flex; align-items: center; }
        .perc-sign { position: absolute; right: 16px; font-weight: 800; color: #94a3b8; font-size: 14px; }
        .btn-add-tax { 
            width: 100%; padding: 14px; background: white; border: 1.5px solid #e2e8f0; border-radius: 12px; 
            color: #0f172a; font-weight: 800; font-size: 14px; cursor: pointer; transition: all 0.2s;
            display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .btn-add-tax:hover { background: #f1f5f9; border-color: #cbd5e1; }

        .tax-logic-toggles { display: flex; flex-direction: column; gap: 20px; margin-top: 12px; }

        /* ─── SIMULATOR ─── */
        .simulator-card { 
            background: #0f172a; color: white; border-radius: 24px; padding: 28px; 
            position: sticky; top: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            border: 1px solid rgba(255,255,255,0.1);
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .sim-title { font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 12px; margin-bottom: 10px; color: #f97316; }
        .sim-desc { font-size: 13.5px; color: #94a3b8; margin-bottom: 28px; line-height: 1.5; }
        
        .sim-content { display: flex; flex-direction: column; gap: 16px; }
        .sim-row { display: flex; justify-content: space-between; font-size: 14.5px; color: #94a3b8; }
        .sim-row.active { color: white; font-weight: 700; }
        .sim-row strong { font-family: 'JetBrains Mono', monospace; font-size: 16px; }
        
        .sim-split { margin-left: 14px; display: flex; flex-direction: column; gap: 8px; margin-top: -6px; }
        .split-row { font-size: 12.5px; color: #475569; font-family: 'JetBrains Mono', monospace; }
        
        .sim-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 8px 0; }
        .sim-row.total { font-size: 20px; color: #f97316; padding-top: 6px; }
        .sim-row.total strong { font-weight: 900; font-size: 22px; }
        
        .sim-badge { 
            margin-top: 24px; text-align: center; font-size: 11px; font-weight: 900; 
            letter-spacing: 0.12em; color: #0f172a; background: #94a3b8; padding: 8px; border-radius: 8px; 
        }

        .help-card { background: #fffaf5; border: 1.5px solid #fed7aa; border-radius: 20px; padding: 24px; margin-top: 24px; }
        .help-card h5 { margin: 0 0 10px; font-size: 15px; font-weight: 800; color: #9a3412; }
        .help-card p { margin: 0; font-size: 13.5px; color: #c2410c; line-height: 1.6; font-weight: 500; }
        
        .animate-slide-down { animation: slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .tax-screen-container { min-height: 800px; }
      `}</style>
    </DashboardLayout>
  );
}
