// pages/owner/configurations.js — Enterprise POS Configuration Engine
// SUPER_ADMIN only | Responsive | Modern Segmented Tabs | Centered Layout

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import PrintPlatformSetup from '../../components/PrintPlatformSetup';
import { fileToBitmapGrid } from '../../utils/logoBitmap';
import PrintLivePreview from '../../components/PrintLivePreview';
import { invalidatePrintTemplateCache } from '../../utils/printTemplateSync';
import {
  FaSave, FaCheckCircle, FaExclamationCircle,
  FaBolt, FaReceipt, FaCalculator, FaPrint,
  FaSearch, FaCreditCard, FaCamera, FaBook, FaChair, FaShoppingCart,
  FaQrcode, FaBoxes, FaIndustry, FaUsers,
  FaTags, FaUtensils, FaTruck, FaUserFriends,
  FaPlus, FaTimes, FaBuilding, FaToggleOn, FaToggleOff, FaInfoCircle
} from 'react-icons/fa';

// ═════════════════════════════════════════════════════════════════════════════
// TABS
// ═════════════════════════════════════════════════════════════════════════════

const TABS = [
  { key: 'modules',  label: 'Configuration',    icon: <FaBolt />,       mobileLabel: 'Config' },
  { key: 'tax',      label: 'Tax Rules',        icon: <FaReceipt />,    mobileLabel: 'Tax' },
  { key: 'roundoff', label: 'Round-off',        icon: <FaCalculator />, mobileLabel: 'Round-off' },
  { key: 'print',    label: 'Templates & Paper', icon: <FaPrint />,     mobileLabel: 'Templates' },
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
  { key: 'pm_purchase',         icon: <FaShoppingCart />,title: 'Purchase Orders',   desc: 'Vendor order & purchasing management',      color: '#ef4444' },
  { key: 'pm_customers',        icon: <FaUsers />,       title: 'Customers',         desc: 'Customer directory & profiles',             color: '#f97316' },
  { key: 'pm_loyalty',          icon: <FaTags />,        title: 'Loyalty',           desc: 'Points & rewards program',                  color: '#ef4444' },
  { key: 'pm_discount',         icon: <FaTags />,        title: 'Enable Discounts',  desc: 'Allow order and item discounts',            color: '#f59e0b' },
  { key: 'pm_send_to_kitchen',  icon: <FaUtensils />,    title: 'Send to Kitchen',   desc: 'Forward orders to kitchen display',         color: '#22c55e' },
  { key: 'pm_online_delivery',  icon: <FaTruck />,       title: 'Online Delivery',   desc: 'Enable delivery ordering',                  color: '#06b6d4' },
];

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS & SYNC UTILS
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_THERMAL_LAYOUT = {
  preset: '58MM',
  widthMm: 58,
  columns: 32,
  printableDots: 384,
  leftMargin: 0,
  rightMargin: 0,
  lineSpacing: 0,
  autoCut: true,
  feedLines: 3,
  showRestaurantName: true,
  showDailyBillNo: true,
  showCustomerDetails: true,
  showTableLabel: true,
  showFssai: true,
  leftMarginDots: 0,
  rightMarginDots: 0,
  guardCols: 0,
  safeCols: 0,
};

const DEFAULT_KOT_TEMPLATE = {
  ...DEFAULT_THERMAL_LAYOUT,
  showGstBreakdown: false,
  titleFontSize: 'DOUBLE',
  fontSize: 'NORMAL',
  totalFontSize: 'DOUBLE',
  header: '*** KOT ***',
  footer: '*** SEND TO KITCHEN ***',
};

const DEFAULT_RECEIPT_TEMPLATE = {
  ...DEFAULT_THERMAL_LAYOUT,
  showGstBreakdown: true,
  titleFontSize: 'DOUBLE',
  fontSize: 'NORMAL',
  totalFontSize: 'DOUBLE',
  header: '*** TAX INVOICE ***',
  footer: '* THANK YOU! VISIT AGAIN !! *',
};

const DEFAULT_THERMAL_TEMPLATE = {
  ...DEFAULT_THERMAL_LAYOUT,
  fontSize: DEFAULT_RECEIPT_TEMPLATE.fontSize,
  kotFontSize: DEFAULT_KOT_TEMPLATE.fontSize,
  titleFontSize: DEFAULT_RECEIPT_TEMPLATE.titleFontSize,
  kotTitleFontSize: DEFAULT_KOT_TEMPLATE.titleFontSize,
  showGstBreakdown: true,
  kotHeader: DEFAULT_KOT_TEMPLATE.header,
  kotFooter: DEFAULT_KOT_TEMPLATE.footer,
  receiptHeader: DEFAULT_RECEIPT_TEMPLATE.header,
  receiptFooter: DEFAULT_RECEIPT_TEMPLATE.footer,
};

const DEFAULT_REGULAR_TEMPLATE = {
  paperPreset: 'A4',
  widthMm: 210,
  heightMm: 297,
  orientation: 'PORTRAIT',
  marginMm: 10,
  paperSource: '',
  scaling: 100,
  colorMode: 'GRAYSCALE',
  showLogo: true,
  showCustomer: true,
  showTax: true,
  showHsnSac: true,
  showUnits: true,
  showDiscounts: true,
  showPayment: true,
  showAmountInWords: true,
  showTerms: true,
  showFooter: true,
  showSignature: true,
  terms: '',
  footer: 'Thank you for your business.',
};

const FONT_SIZE_OPTIONS = [
  { value: 'NORMAL', label: 'Normal (1x)' },
  { value: 'DOUBLE_HEIGHT', label: 'Double Height (2H)' },
  { value: 'DOUBLE_WIDTH', label: 'Double Width (2W)' },
  { value: 'DOUBLE', label: 'Double (2x)' },
];

const THERMAL_PAPER_PRESETS = [
  { preset: '58MM', label: '2 inch / 58 mm', widthMm: 58, columns: 32, printableDots: 384 },
  { preset: '80MM', label: '3 inch / 80 mm', widthMm: 80, columns: 48, printableDots: 576 },
  { preset: '4IN', label: '4 inch', widthMm: 101.6, columns: 64, printableDots: 832 },
];

const REGULAR_PAPER_PRESETS = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  LETTER: { widthMm: 215.9, heightMm: 279.4 },
  LEGAL: { widthMm: 215.9, heightMm: 355.6 },
  CUSTOM: {},
};

const stripPrintMeta = (settings) => {
  const { _meta, ...rest } = settings || {};
  return rest;
};

const mergeThermalTemplate = (template) => ({
  ...DEFAULT_THERMAL_TEMPLATE,
  ...(template || {}),
});

const mergeKotTemplate = (template) => {
  const source = template || {};
  return {
    ...DEFAULT_KOT_TEMPLATE,
    ...source,
    titleFontSize: source.titleFontSize ?? source.kotTitleFontSize ?? DEFAULT_KOT_TEMPLATE.titleFontSize,
    fontSize: source.fontSize ?? source.kotFontSize ?? DEFAULT_KOT_TEMPLATE.fontSize,
    totalFontSize: source.totalFontSize ?? source.kotTotalFontSize ?? DEFAULT_KOT_TEMPLATE.totalFontSize,
    header: source.header ?? source.kotHeader ?? DEFAULT_KOT_TEMPLATE.header,
    footer: source.footer ?? source.kotFooter ?? DEFAULT_KOT_TEMPLATE.footer,
  };
};

const mergeReceiptTemplate = (template) => {
  const source = template || {};
  return {
    ...DEFAULT_RECEIPT_TEMPLATE,
    ...source,
    titleFontSize: source.titleFontSize ?? DEFAULT_RECEIPT_TEMPLATE.titleFontSize,
    fontSize: source.fontSize ?? DEFAULT_RECEIPT_TEMPLATE.fontSize,
    totalFontSize: source.totalFontSize ?? DEFAULT_RECEIPT_TEMPLATE.totalFontSize,
    header: source.header ?? source.receiptHeader ?? DEFAULT_RECEIPT_TEMPLATE.header,
    footer: source.footer ?? source.receiptFooter ?? DEFAULT_RECEIPT_TEMPLATE.footer,
  };
};

const mergeRegularTemplate = (template) => ({
  ...DEFAULT_REGULAR_TEMPLATE,
  ...(template || {}),
});

const buildThermalCompatibilityTemplate = (kotInput, receiptInput) => {
  const kot = mergeKotTemplate(kotInput);
  const receipt = mergeReceiptTemplate(receiptInput);
  return {
    ...DEFAULT_THERMAL_TEMPLATE,
    ...receipt,
    fontSize: receipt.fontSize,
    titleFontSize: receipt.titleFontSize,
    totalFontSize: receipt.totalFontSize,
    showRestaurantName: receipt.showRestaurantName !== false,
    showDailyBillNo: receipt.showDailyBillNo !== false,
    showCustomerDetails: receipt.showCustomerDetails !== false,
    showTableLabel: receipt.showTableLabel !== false,
    showFssai: receipt.showFssai !== false,
    showGstBreakdown: receipt.showGstBreakdown !== false,
    kotFontSize: kot.fontSize,
    kotTitleFontSize: kot.titleFontSize,
    kotTotalFontSize: kot.totalFontSize,
    kotHeader: kot.header,
    kotFooter: kot.footer,
    receiptHeader: receipt.header,
    receiptFooter: receipt.footer,
  };
};

const syncThermalTemplateToLocalStorage = (documentKey, template) => {
  const prefix = documentKey === 'KOT' ? 'PRINT_KOT_' : 'PRINT_RECEIPT_';
  localStorage.setItem(`${prefix}PAPER_MM`, String(template.widthMm || '58'));
  localStorage.setItem(`${prefix}WIDTH_COLS`, String(template.columns || 32));
  localStorage.setItem(`${prefix}PRINTABLE_DOTS`, String(template.printableDots || 384));
  localStorage.setItem(`${prefix}LEFT_MARGIN_DOTS`, String(template.leftMarginDots ?? 0));
  localStorage.setItem(`${prefix}RIGHT_MARGIN_DOTS`, String(template.rightMarginDots ?? 0));
  localStorage.setItem(`${prefix}GUARD_COLS`, String(template.guardCols ?? 0));
  localStorage.setItem(`${prefix}SAFE_COLS`, String(template.safeCols ?? 0));
  localStorage.setItem(`${prefix}FEED_LINES`, String(template.feedLines ?? 3));
  localStorage.setItem(`${prefix}AUTO_CUT`, template.autoCut !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_RESTAURANT_NAME`, template.showRestaurantName !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_DAILY_BILL_NO`, template.showDailyBillNo !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_CUSTOMER_DETAILS`, template.showCustomerDetails !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_TABLE_LABEL`, template.showTableLabel !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_FSSAI`, template.showFssai !== false ? '1' : '0');
  localStorage.setItem(`${prefix}SHOW_GST_BREAKDOWN`, template.showGstBreakdown !== false ? '1' : '0');
  localStorage.setItem(`${prefix}TITLE_FONT_SIZE`, template.titleFontSize || 'DOUBLE');
  localStorage.setItem(`${prefix}FONT_SIZE`, template.fontSize || 'NORMAL');
  localStorage.setItem(`${prefix}TOTAL_FONT_SIZE`, template.totalFontSize || 'DOUBLE');
};

function syncPrintSettingsToLocalStorage(config) {
  if (typeof window === 'undefined' || !config) return;
  try {
    const kot = mergeKotTemplate(config.kotTemplate || config.thermalTemplate);
    const receipt = mergeReceiptTemplate(config.receiptTemplate || config.thermalTemplate);

    syncThermalTemplateToLocalStorage('KOT', kot);
    syncThermalTemplateToLocalStorage('RECEIPT', receipt);

    localStorage.setItem('PRINT_SHOW_RESTAURANT_NAME', receipt.showRestaurantName !== false ? 'true' : 'false');
    localStorage.setItem('PRINT_SHOW_DAILY_BILL_NO', receipt.showDailyBillNo !== false ? 'true' : 'false');
    localStorage.setItem('PRINT_SHOW_CUSTOMER_DETAILS', receipt.showCustomerDetails !== false ? 'true' : 'false');
    localStorage.setItem('PRINT_SHOW_TABLE_LABEL', receipt.showTableLabel !== false ? 'true' : 'false');
    localStorage.setItem('PRINT_SHOW_FSSAI', receipt.showFssai !== false ? 'true' : 'false');
    localStorage.setItem('PRINT_SHOW_GST_BREAKDOWN', receipt.showGstBreakdown !== false ? 'true' : 'false');

    localStorage.setItem('PRINT_TITLE_FONT_SIZE', receipt.titleFontSize || 'DOUBLE');
    localStorage.setItem('PRINT_FONT_SIZE', receipt.fontSize || 'NORMAL');
    localStorage.setItem('PRINT_TOTAL_FONT_SIZE', receipt.totalFontSize || 'DOUBLE');
    localStorage.setItem('PRINT_KOT_TITLE_FONT_SIZE', kot.titleFontSize || 'DOUBLE');
    localStorage.setItem('PRINT_KOT_FONT_SIZE', kot.fontSize || 'NORMAL');
    localStorage.setItem('PRINT_KOT_TOTAL_FONT_SIZE', kot.totalFontSize || 'DOUBLE');

    localStorage.setItem('PRINT_KOT_HEADER', kot.header ?? '*** KOT ***');
    localStorage.setItem('PRINT_KOT_FOOTER', kot.footer ?? '*** SEND TO KITCHEN ***');
    localStorage.setItem('PRINT_RECEIPT_HEADER', receipt.header ?? '*** TAX INVOICE ***');
    localStorage.setItem('PRINT_RECEIPT_FOOTER', receipt.footer ?? '* THANK YOU! VISIT AGAIN !! *');
    
    localStorage.setItem('PRINT_PAPER_MM', String(receipt.widthMm || '58'));
    localStorage.setItem('PRINT_WIDTH_COLS', String(receipt.columns || 32));
    localStorage.setItem('PRINT_LEFT_MARGIN_DOTS', String(receipt.leftMarginDots ?? 0));
    localStorage.setItem('PRINT_RIGHT_MARGIN_DOTS', String(receipt.rightMarginDots ?? 0));
    localStorage.setItem('PRINT_GUARD_COLS', String(receipt.guardCols ?? 0));
    localStorage.setItem('PRINT_SAFE_COLS', String(receipt.safeCols ?? 0));
  } catch (err) {
    console.error('Failed to sync print settings to localStorage:', err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export default function ConfigurationsPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'STAFF']}>
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
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [activeTemplateDoc, setActiveTemplateDoc] = useState('receipt');

  // UI State for Tax feature
  const [newRate, setNewRate]     = useState('');
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [printConfigRaw, setPrintConfigRaw] = useState(null);

  // ─── State ─────────────────────────────────────────────────────────────────

  const [config, setConfig] = useState({
    pm_online_payment: false, pm_menu_images: false, pm_credit_ledger: false,
    pm_table_management: false, pm_qr_ordering: false, pm_inventory: false,
    pm_purchase: true,
    pm_customers: false, pm_loyalty: false,
    pm_send_to_kitchen: false, pm_online_delivery: false, pm_allow_multi_customer: false,
    pm_customer_age: false,
    credit_allocation_mode: 'OLDEST_FIRST',
    
    tax_enabled: false,
    tax_label_global: 'Tax',
    tax_rates: [
      { id: 't1', name: 'Tax 5%', value: 5 },
      { id: 't2', name: 'Tax 12%', value: 12 },
      { id: 't3', name: 'Tax 18%', value: 18 }
    ],
    tax_default_id: 't1',
    tax_prices_include: false,
    tax_split_enabled: false,

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

    // Print templates
    kotTemplate: DEFAULT_KOT_TEMPLATE,
    receiptTemplate: DEFAULT_RECEIPT_TEMPLATE,
    thermalTemplate: DEFAULT_THERMAL_TEMPLATE,
    regularTemplate: DEFAULT_REGULAR_TEMPLATE,
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
            { id: 't1', name: 'Tax 5%', value: 5 },
            { id: 't2', name: 'Tax 12%', value: 12 },
            { id: 't3', name: 'Tax 18%', value: 18 }
          ];
          
          if (Array.isArray(d.taxRates) && d.taxRates.length > 0) {
            // Check if backend already sent objects or old flat numbers
            parsedRates = d.taxRates.map((r, i) => 
               typeof r === 'object' ? r : { id: `tr-${i}-${Date.now()}`, name: `${d.taxLabelGlobal || 'Tax'} ${r}%`, value: r }
            );
          }

          // Fetch Print Configurations concurrently
          const printParams = {};
          if (orgId && orgId !== '0') {
            printParams.orgId = orgId;
          }
          const printResp = await api.get('/api/v1/print-configurations/effective', { params: printParams }).catch(() => null);
          
          let kot = DEFAULT_KOT_TEMPLATE;
          let receipt = DEFAULT_RECEIPT_TEMPLATE;
          let thermal = DEFAULT_THERMAL_TEMPLATE;
          let regular = DEFAULT_REGULAR_TEMPLATE;
          if (printResp?.data?.success && printResp?.data?.data) {
            const pc = stripPrintMeta(printResp.data.data);
            setPrintConfigRaw(pc);
            const legacyThermal = mergeThermalTemplate(pc.thermalTemplate);
            kot = mergeKotTemplate(pc.kotTemplate || legacyThermal);
            receipt = mergeReceiptTemplate(pc.receiptTemplate || legacyThermal);
            thermal = mergeThermalTemplate(pc.thermalTemplate || buildThermalCompatibilityTemplate(kot, receipt));
            if (pc.regularTemplate) {
              regular = mergeRegularTemplate(pc.regularTemplate);
            }
          } else {
            setPrintConfigRaw(null);
          }

          setConfig({
            pm_online_payment: !!d.onlinePaymentEnabled, pm_menu_images: !!d.menuImagesEnabled,
            pm_credit_ledger: !!d.creditEnabled, pm_table_management: !!d.tableManagementEnabled,
            pm_qr_ordering: d.qrOrderingEnabled !== false, pm_inventory: !!d.inventoryEnabled,
            pm_purchase: d.purchaseEnabled !== false,
            pm_customers: !!d.customersEnabled,
            pm_loyalty: !!d.loyaltyEnabled, pm_send_to_kitchen: d.sendToKitchenEnabled !== false,
            pm_online_delivery: !!d.onlineDeliveryEnabled, pm_allow_multi_customer: false,
            pm_customer_age: false,
            credit_allocation_mode: d.creditAllocationMode || 'OLDEST_FIRST',
            
            tax_enabled: !!d.taxEnabled, 
            tax_label_global: d.taxLabelGlobal || 'Tax',
            tax_rates: parsedRates,
            tax_default_id: d.taxDefaultId || (parsedRates[0]?.id || null),
            tax_prices_include: !!d.pricesIncludeTax, 
            tax_split_enabled: false,

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

            kotTemplate: kot,
            receiptTemplate: receipt,
            thermalTemplate: thermal,
            regularTemplate: regular,
          });
        }
      } catch (err) {
        setMsgType('error');
        setMessage(err.response?.data?.message || err.message || 'Failed to load configuration');
      }
      finally { setLoading(false); }
    })();
  }, [configEndpoint, orgId]);

  const toggle = useCallback((f) => setConfig(p => ({ ...p, [f]: !p[f] })), []);
  const set = useCallback((f, v) => setConfig(p => ({ ...p, [f]: v })), []);
  const setTemplate = useCallback((kind, key, value) => {
    const base = kind === 'regularTemplate'
      ? DEFAULT_REGULAR_TEMPLATE
      : kind === 'kotTemplate'
        ? DEFAULT_KOT_TEMPLATE
        : kind === 'receiptTemplate'
          ? DEFAULT_RECEIPT_TEMPLATE
          : DEFAULT_THERMAL_TEMPLATE;
    setConfig((previous) => ({
      ...previous,
      [kind]: {
        ...base,
        ...(previous[kind] || {}),
        [key]: value,
      },
    }));
  }, []);
  const setTemplateValues = useCallback((kind, values) => {
    const base = kind === 'regularTemplate'
      ? DEFAULT_REGULAR_TEMPLATE
      : kind === 'kotTemplate'
        ? DEFAULT_KOT_TEMPLATE
        : kind === 'receiptTemplate'
          ? DEFAULT_RECEIPT_TEMPLATE
          : DEFAULT_THERMAL_TEMPLATE;
    setConfig((previous) => ({
      ...previous,
      [kind]: {
        ...base,
        ...(previous[kind] || {}),
        ...values,
      },
    }));
  }, []);

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
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        onlinePaymentEnabled: config.pm_online_payment, menuImagesEnabled: config.pm_menu_images,
        creditEnabled: config.pm_credit_ledger, tableManagementEnabled: config.pm_table_management,
        creditAllocationMode: config.credit_allocation_mode || 'OLDEST_FIRST',
        qrOrderingEnabled: config.pm_qr_ordering, inventoryEnabled: config.pm_inventory,
        purchaseEnabled: config.pm_purchase,
        productionEnabled: false, customersEnabled: config.pm_customers,
        loyaltyEnabled: config.pm_loyalty, sendToKitchenEnabled: config.pm_send_to_kitchen,
        onlineDeliveryEnabled: config.pm_online_delivery, allowMultipleCustomersPerOrder: false,
        customerAgeEnabled: false,

        taxEnabled: config.tax_enabled,
        taxLabelGlobal: config.tax_label_global,
        taxRates: config.tax_rates,
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

      const existingPrintSettings = stripPrintMeta(printConfigRaw);
      const kotTemplate = mergeKotTemplate({
        ...(existingPrintSettings.kotTemplate || {}),
        ...(config.kotTemplate || {}),
      });
      const receiptTemplate = mergeReceiptTemplate({
        ...(existingPrintSettings.receiptTemplate || {}),
        ...(config.receiptTemplate || {}),
      });
      const printSettings = {
        ...existingPrintSettings,
        kotTemplate,
        receiptTemplate,
        thermalTemplate: buildThermalCompatibilityTemplate(kotTemplate, receiptTemplate),
        regularTemplate: mergeRegularTemplate({
          ...(existingPrintSettings.regularTemplate || {}),
          ...(config.regularTemplate || {}),
        }),
      };

      const [generalResp, printResp] = await Promise.all([
        api.put(configEndpoint, payload),
        api.put('/api/v1/print-configurations', {
          scopeType: hasBranchContext ? 'ORGANIZATION' : 'CLIENT',
          scopeId: hasBranchContext ? orgId : null,
          orgId: hasBranchContext ? orgId : null,
          settings: printSettings,
        }),
      ]);

      if (!generalResp.data?.success) {
        throw new Error(generalResp.data?.message || 'Configuration save failed');
      }
      if (!printResp.data?.success) {
        throw new Error(printResp.data?.message || 'Print template save failed');
      }

      setPrintConfigRaw(stripPrintMeta(printResp.data?.data || printSettings));
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cafeqr_sales_config');
        Object.keys(localStorage)
          .filter((key) => key.startsWith('cafeqr_sales_config:'))
          .forEach((key) => localStorage.removeItem(key));
        window.dispatchEvent(new Event('cafeqr-config-updated'));
        invalidatePrintTemplateCache();
      }
      syncPrintSettingsToLocalStorage(config);
      setMsgType('success');
      setMessage(hasBranchContext
        ? `Configuration saved for ${orgName || 'selected branch'}`
        : 'Default configuration saved successfully');
    } catch (err) {
      setMsgType('error');
      setMessage(err.response?.data?.message || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [config, configEndpoint, hasBranchContext, orgId, orgName, printConfigRaw]);

  const kotTemplate = mergeKotTemplate(config.kotTemplate || config.thermalTemplate);
  const receiptTemplate = mergeReceiptTemplate(config.receiptTemplate || config.thermalTemplate);
  const regularTemplate = mergeRegularTemplate(config.regularTemplate);

  const renderThermalTemplateEditor = (kind, template, title, icon, copy) => {
    const visibilityOptions = [
      ['showRestaurantName', 'Restaurant name'],
      ['showDailyBillNo', 'Daily bill number'],
      ['showCustomerDetails', 'Customer details'],
      ['showTableLabel', 'Table / order type'],
      ['showFssai', 'FSSAI license'],
      ...(kind === 'receiptTemplate' ? [['showGstBreakdown', 'GST breakdown']] : []),
    ];

    return (
      <div className="template-group">
        <div className="template-group-title">{icon} {title}</div>
        <span className="group-desc">{copy}</span>
        <div className="paper-preset-row">
          {[...THERMAL_PAPER_PRESETS, { preset: 'CUSTOM', label: 'Custom' }].map((preset) => (
            <button
              type="button"
              key={preset.preset}
              className={template.preset === preset.preset ? 'active' : ''}
              onClick={() => setTemplateValues(kind, {
                preset: preset.preset,
                ...(preset.widthMm ? {
                  widthMm: preset.widthMm,
                  columns: preset.columns,
                  printableDots: preset.printableDots,
                } : {}),
              })}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="template-grid-fields">
          <div className="input-group">
            <label className="group-lbl">Width (mm)</label>
            <input type="number" className="form-input" value={template.widthMm} onChange={(e) => setTemplate(kind, 'widthMm', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Columns</label>
            <input type="number" className="form-input" value={template.columns} onChange={(e) => setTemplate(kind, 'columns', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Printable dots</label>
            <input type="number" className="form-input" value={template.printableDots} onChange={(e) => setTemplate(kind, 'printableDots', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Feed lines</label>
            <input type="number" className="form-input" value={template.feedLines} onChange={(e) => setTemplate(kind, 'feedLines', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Left margin dots</label>
            <input type="number" min="0" max="100" className="form-input" value={template.leftMarginDots ?? 0} onChange={(e) => setTemplate(kind, 'leftMarginDots', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Right margin dots</label>
            <input type="number" min="0" max="100" className="form-input" value={template.rightMarginDots ?? 0} onChange={(e) => setTemplate(kind, 'rightMarginDots', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Guard columns</label>
            <input type="number" min="0" max="10" className="form-input" value={template.guardCols ?? 0} onChange={(e) => setTemplate(kind, 'guardCols', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Safe columns</label>
            <input type="number" min="0" max="10" className="form-input" value={template.safeCols ?? 0} onChange={(e) => setTemplate(kind, 'safeCols', Number(e.target.value))} />
          </div>
        </div>

        <button type="button" className="template-toggle-row" onClick={() => setTemplate(kind, 'autoCut', !template.autoCut)}>
          <span>Auto-cut after print</span>
          <div className={`toggle-switch ${template.autoCut ? 'on' : ''}`}><div className="toggle-thumb" /></div>
        </button>

        <div className="template-checkbox-grid">
          {visibilityOptions.map(([key, label]) => (
            <button type="button" key={key} className="template-check" onClick={() => setTemplate(kind, key, !(template[key] !== false))}>
              <span>{label}</span>
              <div className={`toggle-switch small ${template[key] !== false ? 'on' : ''}`}><div className="toggle-thumb" /></div>
            </button>
          ))}
        </div>

        <div className="template-grid-fields">
          {[
            ['titleFontSize', 'Title font'],
            ['fontSize', 'Body font'],
            ['totalFontSize', 'Total font'],
          ].map(([key, label]) => (
            <div key={key} className="input-group">
              <label className="group-lbl">{label}</label>
              <NiceSelect value={template[key]} onChange={(v) => setTemplate(kind, key, v)} options={FONT_SIZE_OPTIONS} />
            </div>
          ))}
        </div>

        <div className="template-grid-fields">
          <div className="input-group">
            <label className="group-lbl">Header</label>
            <input className="form-input" value={template.header || ''} onChange={(e) => setTemplate(kind, 'header', e.target.value)} placeholder={kind === 'kotTemplate' ? '*** KOT ***' : '*** TAX INVOICE ***'} />
          </div>
          <div className="input-group">
            <label className="group-lbl">Footer</label>
            <input className="form-input" value={template.footer || ''} onChange={(e) => setTemplate(kind, 'footer', e.target.value)} placeholder={kind === 'kotTemplate' ? '*** SEND TO KITCHEN ***' : '* THANK YOU! VISIT AGAIN !! *'} />
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout title="System Configurations" showBack={false}>
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
    <DashboardLayout title="System Configurations" showBack={false}>
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
                <h2>Configuration</h2>
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
                        <h3 style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {m.title}
                          <InfoTooltip 
                            id={`tip-${m.key}`} 
                            text={m.desc} 
                            activeTooltip={activeTooltip} 
                            setActiveTooltip={setActiveTooltip} 
                          />
                        </h3>
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
                        <div className="subconfig-row" onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
                          <div className="subconfig-row-text">
                            <strong>Credit Allocation Mode</strong>
                            <span>Determine order priority when settlement occurs</span>
                          </div>
                          <div style={{ width: 180 }} className="small-select">
                            <NiceSelect
                              value={config.credit_allocation_mode}
                              onChange={(v) => set('credit_allocation_mode', v)}
                              options={[
                                { value: 'OLDEST_FIRST', label: 'Oldest Bills First' },
                                { value: 'FIFO', label: 'First In First Out' }
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

          {activeTab === 'tax' && (
            <div className="fade-in tax-screen-container">
              <div className="tax-grid">
                
                {/* Left Column: Configs and Rules */}
                <div className="tax-main-col" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Card 1: Tax Configurations */}
                  <div className="form-card">
                      {/* Banner row toggle switch */}
                      <div className="form-row toggle-row banner-row" onClick={() => toggle('tax_enabled')}>
                        <div className="row-icon"><FaReceipt /></div>
                        <div className="row-info">
                           <label style={{ display: 'inline-flex', alignItems: 'center' }}>
                             Enable {config.tax_label_global} Computations
                             <InfoTooltip id="tip_tax_enabled" text="Turn on automatic tax calculation for all incoming orders and receipt generation." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                           </label>
                           <span>Activate automatic tax calculations for all generated bills</span>
                        </div>
                        <div className={`toggle-switch ${config.tax_enabled ? 'on' : ''}`}>
                            <div className="toggle-thumb"></div>
                        </div>
                      </div>

                      {config.tax_enabled && (
                        <div className="nested-forms animate-slide-down" style={{ border: 'none', background: 'transparent', padding: 0, marginTop: 0 }}>
                          
                          {/* Tax Logic Toggles */}
                          <div className="tax-logic-toggles" style={{ marginTop: 0, marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div className="form-row toggle-row styled-toggle-card" onClick={() => toggle('tax_prices_include')}>
                                  <div className="row-icon-small"><FaReceipt /></div>
                                  <div className="row-info" style={{ marginLeft: '12px' }}>
                                      <label style={{ display: 'inline-flex', alignItems: 'center', fontWeight: '700', fontSize: '15px' }}>
                                        Prices Include {config.tax_label_global}
                                        <InfoTooltip id="tip_tax_prices_include" text="Inclusive pricing: Menu price already includes the tax amount. Exclusive pricing: Tax is added on top of menu price." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                                      </label>
                                      <span style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>(Inclusive) Tax is back-calculated from price</span>
                                  </div>
                                  <div className={`toggle-switch small ${config.tax_prices_include ? 'on' : ''}`}>
                                      <div className="toggle-thumb"></div>
                                  </div>
                              </div>
                          </div>

                          <div className="divider-line" style={{ margin: '12px 0' }} />

                          {/* Global Tax Label Input */}
                          <div className="input-group">
                              <label className="group-lbl" style={{ display: 'inline-flex', alignItems: 'center', fontWeight: '700', fontSize: '14.5px', color: '#334155' }}>
                                  Global Tax Label
                                  <InfoTooltip id="tip_tax_label_global" text="Set the global name for taxes (e.g., GST, VAT, Tax) displayed on all bills and reports." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                              </label>
                              <span className="group-desc" style={{ fontSize: '13px', color: '#64748b' }}>Used on bills and reports globally (e.g. Tax, VAT, GST).</span>
                              <div className="input-with-prefix" style={{ position: 'relative', display: 'flex', alignItems: 'center', maxWidth: '300px', width: '100%' }}>
                                  <span className="input-prefix-icon" style={{ position: 'absolute', left: '16px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}><FaTags /></span>
                                  <input 
                                      value={config.tax_label_global} 
                                      onChange={e => set('tax_label_global', e.target.value)} 
                                      className="form-input" 
                                      placeholder="e.g. Tax, VAT" 
                                      style={{ paddingLeft: '44px' }}
                                  />
                              </div>
                          </div>

                          <div className="divider-line" style={{ margin: '12px 0' }} />

                          {/* Default Tax Rate Selector */}
                          <div className="input-group">
                              <label className="group-lbl" style={{ display: 'inline-flex', alignItems: 'center', fontWeight: '700', fontSize: '14.5px', color: '#334155' }}>
                                  Default Tax Rule
                                  <InfoTooltip id="tip_tax_default_id" text="Select the default tax rule applied to new products and orders." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                              </label>
                              <span className="group-desc" style={{ fontSize: '13px', color: '#64748b' }}>The primary tax rule applied to transactions by default.</span>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '480px', width: '100%' }}>
                                  <div style={{ flex: 1 }} className="small-select">
                                      <NiceSelect
                                          value={config.tax_default_id}
                                          onChange={(v) => set('tax_default_id', v)}
                                          options={config.tax_rates.map(r => ({
                                              value: r.id,
                                              label: `${r.name} (${r.value}%)`
                                          }))}
                                      />
                                  </div>
                                  <button type="button" className="btn-secondary" onClick={() => setShowAddRuleModal(true)}>
                                      <FaPlus /> Add / Manage Rules
                                  </button>
                              </div>
                          </div>

                        </div>
                      )}
                  </div>
                </div>

                {/* Right Column: Simulator Preview (Orange Box) */}
                {config.tax_enabled && (
                  <div className="tax-side-col">
                      <div className="simulator-card orange-theme">
                          <div className="sim-title" style={{ color: '#ea580c' }}><FaCalculator /> Real-time Simulation</div>
                          <p className="sim-desc" style={{ color: '#c2410c' }}>See how ₹100 is computed with your current settings.</p>
                          
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
                                      <span style={{ color: '#c2410c' }}>Item Base Price</span>
                                      <strong style={{ color: '#ea580c' }}>{show(fmt(itemPrice))}</strong>
                                  </div>
                                  <div className="sim-row active">
                                      <span style={{ color: '#ea580c' }}>{config.tax_label_global} ({rateVal}%)</span>
                                      <strong style={{ color: '#ea580c' }}>{show(fmt(taxAmt))}</strong>
                                  </div>

                                  <div className="sim-divider" style={{ background: '#fed7aa' }} />
                                  <div className="sim-row total">
                                      <span style={{ color: '#ea580c' }}>Grand Total</span>
                                      <strong style={{ color: '#ea580c' }}>{show(fmt(total))}</strong>
                                  </div>
                                  <div className="sim-badge" style={{ background: '#ea580c', color: 'white' }}>
                                      {isInc ? 'INCLUSIVE PRICING' : 'EXCLUSIVE PRICING'}
                                  </div>
                               </div>
                             )
                          })()}
                      </div>
                  </div>
                )}

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
                       <label style={{ display: 'inline-flex', alignItems: 'center' }}>
                         Enable Round-off
                         <InfoTooltip id="tip_ro_enabled" text="Activate rounding adjustments to avoid decimal values in cash or digital bills." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                       </label>
                       <span>Allow rounding adjustments on the final billing amount</span>
                    </div>
                    <div className={`toggle-switch ${config.ro_enabled ? 'on' : ''}`}>
                        <div className="toggle-thumb"></div>
                    </div>
                  </div>

                  {config.ro_enabled && (
                    <div className="nested-forms animate-slide-down">
                      <div className="input-group">
                        <label className="group-lbl" style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Mode of Operation
                          <InfoTooltip id="tip_ro_mode" text="Automatic: System auto-rounds final bill based on factor. Manual: Cashier decides whether to apply rounding up to limit." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                        </label>
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
                          <label className="group-lbl" style={{ display: 'inline-flex', alignItems: 'center' }}>
                            Auto Rounding Factor
                            <InfoTooltip id="tip_ro_auto_factor" text="The precision factor to round the bill total to. E.g. 1.00 rounds ₹15.40 to ₹15.00." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                          </label>
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
                          <label className="group-lbl" style={{ display: 'inline-flex', alignItems: 'center' }}>
                            Maximum Manual Limit
                            <InfoTooltip id="tip_ro_manual_limit" text="The maximum amount a cashier is allowed to manually discount/round-off on a bill." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                          </label>
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
          {/* TAB: PRINT & RECEIPT CUSTOMIZATION ENGINE                        */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'print' && (
             <div className="fade-in">
               <div className="section-header">
                <h2>Templates & Paper</h2>
                <p>Configure thermal receipts, KOTs, and regular tax invoices in one place.</p>
              </div>

              <div className="template-configuration-section form-card full-width">
                <div className="template-section-heading">
                  <div className="pt-section-title">
                    <FaPrint style={{ color: '#f97316' }} />
                    Print Template Configuration
                  </div>
                  <span className="group-desc">Thermal receipts, KOTs, regular invoices, and receipt logo settings are saved together.</span>
                </div>

                <div className="print-editor-layout template-layout">
                  <div className="print-editor-controls">
                    <div className="template-doc-selector">
                      {[
                        ['receipt', <FaReceipt key="receipt" />, 'Final Bill Receipt'],
                        ['kot', <FaUtensils key="kot" />, 'KOT'],
                        ['regular', <FaPrint key="regular" />, 'Regular A4 Invoice'],
                      ].map(([key, icon, label]) => (
                        <button
                          type="button"
                          key={key}
                          className={activeTemplateDoc === key ? 'active' : ''}
                          onClick={() => setActiveTemplateDoc(key)}
                        >
                          {icon}
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>

                    {activeTemplateDoc === 'receipt' && renderThermalTemplateEditor(
                      'receiptTemplate',
                      receiptTemplate,
                      'Final bill receipt',
                      <FaReceipt />,
                      'Thermal customer bill layout, content, and paper settings.'
                    )}

                    {activeTemplateDoc === 'kot' && renderThermalTemplateEditor(
                      'kotTemplate',
                      kotTemplate,
                      'Kitchen order ticket',
                      <FaUtensils />,
                      'Thermal kitchen ticket layout, content, and paper settings.'
                    )}

                    {activeTemplateDoc === 'regular' && (
                    <div className="template-group">
                      <div className="template-group-title"><FaPrint /> Regular tax invoice</div>
                      <div className="template-grid-fields">
                        <div className="input-group">
                          <label className="group-lbl">Paper</label>
                          <NiceSelect
                            value={regularTemplate.paperPreset}
                            onChange={(value) => setTemplateValues('regularTemplate', {
                              paperPreset: value,
                              ...(REGULAR_PAPER_PRESETS[value] || {}),
                            })}
                            options={[
                              { value: 'A4', label: 'A4' },
                              { value: 'A5', label: 'A5' },
                              { value: 'LETTER', label: 'Letter' },
                              { value: 'LEGAL', label: 'Legal' },
                              { value: 'CUSTOM', label: 'Custom driver form' },
                            ]}
                          />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Orientation</label>
                          <NiceSelect
                            value={regularTemplate.orientation}
                            onChange={(value) => setTemplate('regularTemplate', 'orientation', value)}
                            options={[
                              { value: 'PORTRAIT', label: 'Portrait' },
                              { value: 'LANDSCAPE', label: 'Landscape' },
                            ]}
                          />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Width (mm)</label>
                          <input type="number" className="form-input" value={regularTemplate.widthMm} onChange={(e) => setTemplate('regularTemplate', 'widthMm', Number(e.target.value))} />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Height (mm)</label>
                          <input type="number" className="form-input" value={regularTemplate.heightMm} onChange={(e) => setTemplate('regularTemplate', 'heightMm', Number(e.target.value))} />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Margins (mm)</label>
                          <input type="number" className="form-input" value={regularTemplate.marginMm} onChange={(e) => setTemplate('regularTemplate', 'marginMm', Number(e.target.value))} />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Scaling (%)</label>
                          <input type="number" min="50" max="200" className="form-input" value={regularTemplate.scaling || 100} onChange={(e) => setTemplate('regularTemplate', 'scaling', Number(e.target.value))} />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Paper source</label>
                          <input className="form-input" value={regularTemplate.paperSource || ''} onChange={(e) => setTemplate('regularTemplate', 'paperSource', e.target.value)} placeholder="Driver default" />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Colour mode</label>
                          <NiceSelect
                            value={regularTemplate.colorMode}
                            onChange={(value) => setTemplate('regularTemplate', 'colorMode', value)}
                            options={[
                              { value: 'GRAYSCALE', label: 'Grayscale' },
                              { value: 'COLOR', label: 'Colour' },
                            ]}
                          />
                        </div>
                      </div>

                      <div className="template-checkbox-grid">
                        {[
                          ['showLogo', 'Logo'],
                          ['showCustomer', 'Customer'],
                          ['showTax', 'GST / tax'],
                          ['showHsnSac', 'HSN / SAC'],
                          ['showUnits', 'Units'],
                          ['showDiscounts', 'Discounts'],
                          ['showPayment', 'Payment'],
                          ['showAmountInWords', 'Amount in words'],
                          ['showTerms', 'Terms'],
                          ['showFooter', 'Footer'],
                          ['showSignature', 'Signature'],
                        ].map(([key, label]) => (
                          <button type="button" key={key} className="template-check" onClick={() => setTemplate('regularTemplate', key, !(regularTemplate[key] !== false))}>
                            <span>{label}</span>
                            <div className={`toggle-switch small ${regularTemplate[key] !== false ? 'on' : ''}`}><div className="toggle-thumb" /></div>
                          </button>
                        ))}
                      </div>

                      <div className="template-grid-fields">
                        <div className="input-group">
                          <label className="group-lbl">Terms</label>
                          <textarea rows="3" className="form-input form-textarea" value={regularTemplate.terms || ''} onChange={(e) => setTemplate('regularTemplate', 'terms', e.target.value)} />
                        </div>
                        <div className="input-group">
                          <label className="group-lbl">Footer</label>
                          <textarea rows="3" className="form-input form-textarea" value={regularTemplate.footer || ''} onChange={(e) => setTemplate('regularTemplate', 'footer', e.target.value)} />
                        </div>
                      </div>
                    </div>
                    )}

                    <div className="template-group">
                      <div className="template-group-title"><FaCamera /> Receipt logo and footer message</div>
                      <div className="logo-upload-row">
                        <div className="logo-icon-box"><FaCamera /></div>
                        <div className="logo-upload-copy">
                          <input type="file" accept="image/*" onChange={handleLogoFile} disabled={logoSaving} style={{ display: 'none' }} id="logo-input" />
                          <label htmlFor="logo-input" className="btn-secondary">Choose Image File</label>
                          {logoSaving && <span>Processing...</span>}
                        </div>
                        {config.print_logo_bitmap && <button type="button" onClick={clearLogo} className="logo-clear-btn">Clear</button>}
                      </div>
                      {logoMsg && <div className={`template-message ${logoMsg.startsWith('✗') ? 'error' : 'success'}`}>{logoMsg}</div>}
                      {config.print_logo_bitmap && !logoMsg && <div className="template-message success"><FaCheckCircle /> Thermal logo ready</div>}

                      <div className="input-group">
                        <label className="group-lbl">Bill footer message</label>
                        <span className="group-desc">This optional message appears below the thermal receipt footer.</span>
                        <textarea value={config.bill_footer} onChange={(e) => set('bill_footer', e.target.value)} placeholder="e.g. Thank you for your visit!" rows="3" maxLength={200} className="form-input form-textarea" />
                      </div>
                    </div>
                  </div>

                  <div className="print-preview-panel">
                    <PrintLivePreview config={config} />
                  </div>
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
                    <PrintPlatformSetup
                      restaurantId={null} 
                      config={config} 
                      onConfigChange={set} 
                   />
                </div>
             </div>
          )}
        </div>

        {/* Tax Rule Add / Manage Modal Popup */}
        {showAddRuleModal && (
          <div className="modal-overlay" onClick={() => setShowAddRuleModal(false)}>
              <div className="modal-card" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                      <h3 style={{ textTransform: 'capitalize' }}>Manage {config.tax_label_global} Rules</h3>
                      <button type="button" className="close-btn" onClick={() => setShowAddRuleModal(false)}><FaTimes /></button>
                  </div>
                  <div className="modal-body">
                      {/* Add New Rule Section */}
                      <div className="modal-section-title">Add New Rule</div>
                      <div className="input-group">
                          <label className="group-lbl" style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Rule Name</label>
                          <input value={taxName} onChange={e => setTaxName(e.target.value)} className="form-input" placeholder="e.g. GST 5%" />
                      </div>
                      <div className="input-group" style={{ marginTop: '4px' }}>
                          <label className="group-lbl" style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Tax Rate (%)</label>
                          <div className="rate-input-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <input type="number" value={newRate} onChange={e => setNewRate(e.target.value)} className="form-input" placeholder="0.00" />
                              <span className="perc-sign" style={{ position: 'absolute', right: '16px', fontWeight: '800', color: '#94a3b8', fontSize: '14px' }}>%</span>
                          </div>
                      </div>
                      <button type="button" className="btn-primary" onClick={addTaxRate} style={{ width: '100%', padding: '12px', borderRadius: '10px', fontSize: '13.5px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: 'none' }}>
                          <FaPlus /> Add Rule
                      </button>

                      <div className="divider-line" style={{ margin: '12px 0' }} />

                      {/* Defined Rules Section */}
                      <div className="modal-section-title">Defined Rates</div>
                      <div className="modal-rules-list">
                          {config.tax_rates.length === 0 ? (
                              <div className="empty-state" style={{ padding: '16px 0', fontSize: '13px' }}>No rates defined</div>
                          ) : (
                              config.tax_rates.map(r => (
                                  <div key={r.id} className="modal-rule-row">
                                      <div className="modal-rule-info">
                                          <span className="modal-rule-name">{r.name}</span>
                                          <span className="modal-rule-value">({r.value}%)</span>
                                          {config.tax_default_id === r.id && (
                                              <span className="default-badge" style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '99px', background: '#f97316', color: 'white', fontWeight: 900 }}>DEFAULT</span>
                                          )}
                                      </div>
                                      <button 
                                          type="button" 
                                          className="modal-rule-delete" 
                                          onClick={(e) => { e.stopPropagation(); removeTaxRate(r.id); }}
                                      >
                                          <FaTimes />
                                      </button>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
                  <div className="modal-footer" style={{ marginTop: '8px' }}>
                      <button type="button" className="btn-secondary" onClick={() => setShowAddRuleModal(false)} style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13.5px', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Close</button>
                  </div>
              </div>
          </div>
        )}



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
            background: #f97316; color: white;
            box-shadow: 0 4px 16px rgba(249,115,22,0.2), 0 1px 2px rgba(249,115,22,0.1);
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
           position: relative;
           z-index: 10;
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
           border-top-left-radius: 12px;
           border-top-right-radius: 12px;
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
           background: #fafbfc; padding: 16px 20px; border-radius: 16px; border: 1px solid #f1f5f9;
        }
        .banner-row:hover { border-color: #e2e8f0; }
        .row-icon {
            width: 40px; height: 40px; border-radius: 10px; background: #fff5ed; color: #f97316;
           display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;
           box-shadow: inset 0 -2px 0 rgba(0,0,0,0.05);
        }
        .row-info { flex: 1; }
        .row-info label { display: block; font-size: 17px; font-weight: 800; color: #0f172a; cursor: pointer; margin: 0; }
        .row-info span { display: block; font-size: 14px; color: #64748b; margin-top: 6px; font-weight: 500; }

         .nested-forms {
            padding: 16px 20px;
            background: #f8fafc;
            border-radius: 16px;
            border: 1px solid #e2e8f0;
            border-left: none;
            margin-top: 16px;
            margin-left: 0;
            display: flex;
            flex-direction: column;
            gap: 16px;
         }

        /* ─── GROUP FIELDS REFINED ─── */
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        .group-lbl { font-size: 14px; font-weight: 700; color: #334155; margin:0;}
        .group-desc { font-size: 13px; color: #64748b; margin-top: -2px; margin-bottom: 4px; }

        .form-input {
           width: 100%; padding: 14px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px;
           font-size: 15px; color: #0f172a; font-family: inherit; transition: all 0.2s;
           background: #fafbfc;
        }
        .form-input:focus { outline: none; border-color: #fb923c; background: white; box-shadow: 0 0 0 4px rgba(251,146,60,0.1); }
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
           z-index: 50; padding: 10px 24px; padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        }
        .action-footer-inner {
           width: 100%;
           display: flex; justify-content: flex-end; align-items: center; gap: 16px;
        }
        .btn-primary {
           background: #f97316; color: white; border: none; padding: 10px 20px;
           border-radius: 10px; font-weight: 700; font-size: 13.5px; cursor: pointer;
           transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(249,115,22,0.2);
           display: flex; align-items: center; gap: 8px; font-family: inherit;
        }
        .btn-primary:hover:not(:disabled) { background: #ea580c; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(249,115,22,0.25); }
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
            background: #fffaf5; color: #c2410c; border-radius: 24px; padding: 24px; 
            position: sticky; top: 24px; box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.06);
            border: 2px solid #fed7aa;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .sim-title { font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 12px; margin-bottom: 10px; color: #ea580c; }
        .sim-desc { font-size: 13.5px; color: #c2410c; margin-bottom: 28px; line-height: 1.5; }
        
        .sim-content { display: flex; flex-direction: column; gap: 16px; }
        .sim-row { display: flex; justify-content: space-between; font-size: 14.5px; color: #c2410c; }
        .sim-row.active { color: #ea580c; font-weight: 700; }
        .sim-row strong { font-family: 'JetBrains Mono', monospace; font-size: 16px; color: #ea580c; }
        
        .sim-split { margin-left: 14px; display: flex; flex-direction: column; gap: 8px; margin-top: -6px; }
        .split-row { font-size: 12.5px; color: #ea580c; font-family: 'JetBrains Mono', monospace; }
        
        .sim-divider { height: 1px; background: #fed7aa; margin: 8px 0; }
        .sim-row.total { font-size: 20px; color: #ea580c; padding-top: 6px; }
        .sim-row.total strong { font-weight: 900; font-size: 22px; color: #ea580c; }
        
        .sim-badge { 
            margin-top: 24px; text-align: center; font-size: 11px; font-weight: 900; 
            letter-spacing: 0.12em; color: white; background: #ea580c; padding: 8px; border-radius: 8px; 
        }

        .help-card { background: #fffaf5; border: 1.5px solid #fed7aa; border-radius: 20px; padding: 24px; margin-top: 24px; }
        .help-card h5 { margin: 0 0 10px; font-size: 15px; font-weight: 800; color: #9a3412; }
        .help-card p { margin: 0; font-size: 13.5px; color: #c2410c; line-height: 1.6; font-weight: 500; }
        
        .animate-slide-down { animation: slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .tax-screen-container { min-height: 0; }

        /* ─── PRINT TEMPLATE CUSTOMIZER STYLES ─── */
        .print-editor-layout {
           display: grid;
           grid-template-columns: 1fr 380px;
           gap: 24px;
           align-items: start;
           margin-top: 8px;
        }
        .print-editor-controls {
           display: flex;
           flex-direction: column;
           gap: 20px;
        }
        .template-configuration-section {
           max-width: 100% !important;
           gap: 24px;
        }
        .template-section-heading {
           display: flex;
           flex-direction: column;
           gap: 6px;
        }
        .template-layout {
           margin-top: 0;
        }
        .template-doc-selector {
           display: grid;
           grid-template-columns: repeat(3, minmax(0, 1fr));
           gap: 8px;
           padding: 6px;
           background: #f8fafc;
           border: 1px solid #e2e8f0;
           border-radius: 12px;
        }
        .template-doc-selector button {
           border: 0;
           background: transparent;
           color: #64748b;
           padding: 10px 12px;
           border-radius: 8px;
           font-size: 12.5px;
           font-weight: 850;
           cursor: pointer;
           display: flex;
           align-items: center;
           justify-content: center;
           gap: 8px;
           transition: all 0.2s ease;
        }
        .template-doc-selector button:hover {
           color: #0f172a;
           background: #ffffff;
        }
        .template-doc-selector button.active {
           background: #f97316;
           color: #ffffff;
           box-shadow: 0 6px 14px rgba(249,115,22,0.18);
        }
        .template-group {
           border-top: 1px solid #f1f5f9;
           padding-top: 20px;
           display: flex;
           flex-direction: column;
           gap: 16px;
        }
        .template-group:first-child {
           border-top: 0;
           padding-top: 0;
        }
        .template-group-title {
           display: flex;
           align-items: center;
           gap: 8px;
           font-size: 13px;
           font-weight: 900;
           text-transform: uppercase;
           letter-spacing: 0.05em;
           color: #475569;
        }
        .template-group-title svg {
           color: #f97316;
        }
        .paper-preset-row {
           display: flex;
           gap: 8px;
           flex-wrap: wrap;
        }
        .paper-preset-row button {
           border: 1.5px solid #e2e8f0;
           background: #ffffff;
           color: #475569;
           padding: 8px 12px;
           border-radius: 8px;
           font-size: 12.5px;
           font-weight: 800;
           cursor: pointer;
           transition: all 0.2s ease;
        }
        .paper-preset-row button:hover,
        .paper-preset-row button.active {
           border-color: #f97316;
           background: #fff7ed;
           color: #c2410c;
        }
        .template-grid-fields {
           display: grid;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 14px;
        }
        .template-toggle-row,
        .template-check {
           display: flex;
           align-items: center;
           justify-content: space-between;
           gap: 12px;
           width: 100%;
           background: #f8fafc;
           border: 1px solid #edf2f7;
           border-radius: 10px;
           color: #1e293b;
           cursor: pointer;
           font-family: inherit;
           font-weight: 750;
           text-align: left;
        }
        .template-toggle-row {
           padding: 12px 14px;
        }
        .template-check {
           padding: 10px 12px;
           min-height: 46px;
           font-size: 12.5px;
        }
        .template-checkbox-grid {
           display: grid;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 10px;
        }
        .logo-upload-row {
           display: flex;
           gap: 14px;
           align-items: center;
           padding: 14px;
           border: 1px dashed #cbd5e1;
           border-radius: 12px;
           background: #f8fafc;
        }
        .logo-icon-box {
           width: 46px;
           height: 46px;
           border-radius: 12px;
           background: white;
           border: 1px solid #e2e8f0;
           display: flex;
           align-items: center;
           justify-content: center;
           color: #94a3b8;
           flex-shrink: 0;
        }
        .logo-upload-copy {
           flex: 1;
           display: flex;
           align-items: center;
           gap: 12px;
           flex-wrap: wrap;
        }
        .logo-upload-copy span,
        .template-message {
           font-size: 12px;
           font-weight: 700;
        }
        .logo-clear-btn {
           background: #fef2f2;
           border: 1px solid #fee2e2;
           color: #ef4444;
           font-size: 12px;
           cursor: pointer;
           font-weight: 700;
           padding: 7px 12px;
           border-radius: 8px;
        }
        .template-message {
           display: flex;
           align-items: center;
           gap: 6px;
        }
        .template-message.success {
           color: #059669;
        }
        .template-message.error {
           color: #dc2626;
        }
        .print-preview-panel {
           position: sticky;
           top: 24px;
           z-index: 10;
        }
        .pt-section-title {
           font-size: 16px;
           font-weight: 800;
           display: flex;
           align-items: center;
           gap: 10px;
           color: #1e293b;
        }
        .pt-toggle-row {
           display: flex;
           align-items: center;
           justify-content: space-between;
           padding: 12px 0;
           border-bottom: 1px solid #f1f5f9;
           cursor: pointer;
           transition: background 0.2s;
        }
        .pt-toggle-row:last-child {
           border-bottom: none;
        }
        .pt-toggle-info {
           display: flex;
           flex-direction: column;
           gap: 2px;
        }
        .pt-toggle-info strong {
           font-size: 13.5px;
           color: #0f172a;
        }
        .pt-toggle-info span {
           font-size: 11.5px;
           color: #64748b;
        }
        .pt-font-grid {
           display: grid;
           grid-template-columns: 1fr 1fr;
           gap: 16px;
        }
        @media (max-width: 1024px) {
           .print-editor-layout {
              grid-template-columns: 1fr;
           }
           .print-preview-panel {
              position: static;
              margin-top: 24px;
           }
        }
        @media (max-width: 640px) {
           .template-doc-selector {
              grid-template-columns: 1fr;
           }
           .template-grid-fields,
           .template-checkbox-grid {
              grid-template-columns: 1fr;
           }
           .logo-upload-row {
              align-items: flex-start;
           }
        }

        /* Helper-rendered template editor controls need global selectors because
           styled-jsx does not scope class names inside renderThermalTemplateEditor. */
        :global(.template-configuration-section) {
           width: 100%;
           max-width: 100% !important;
           overflow: visible;
        }
        :global(.template-configuration-section .template-section-heading) {
           display: flex;
           flex-direction: column;
           gap: 6px;
           min-width: 0;
        }
        :global(.template-configuration-section .print-editor-layout) {
           display: grid;
           grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
           gap: clamp(18px, 2vw, 28px);
           align-items: start;
           width: 100%;
           min-width: 0;
           margin-top: 8px;
        }
        :global(.template-configuration-section .print-editor-controls) {
           display: flex;
           flex-direction: column;
           gap: 20px;
           min-width: 0;
        }
        :global(.template-configuration-section .template-doc-selector) {
           display: grid;
           grid-template-columns: repeat(3, minmax(0, 1fr));
           gap: 8px;
           padding: 6px;
           background: #f8fafc;
           border: 1px solid #e2e8f0;
           border-radius: 12px;
           width: 100%;
           min-width: 0;
        }
        :global(.template-configuration-section .template-doc-selector button) {
           min-width: 0;
           min-height: 40px;
           border: 0;
           background: transparent;
           color: #64748b;
           padding: 10px 12px;
           border-radius: 8px;
           font-size: clamp(11.5px, 0.8vw, 12.5px);
           font-weight: 850;
           cursor: pointer;
           display: inline-flex;
           align-items: center;
           justify-content: center;
           gap: 8px;
           transition: all 0.2s ease;
           white-space: normal;
           line-height: 1.25;
           text-align: center;
        }
        :global(.template-configuration-section .template-doc-selector button:hover) {
           color: #0f172a;
           background: #ffffff;
        }
        :global(.template-configuration-section .template-doc-selector button.active) {
           background: #f97316;
           color: #ffffff;
           box-shadow: 0 6px 14px rgba(249,115,22,0.18);
        }
        :global(.template-configuration-section .template-group) {
           border-top: 1px solid #f1f5f9;
           padding-top: 20px;
           display: flex;
           flex-direction: column;
           gap: 16px;
           min-width: 0;
           color: #1e293b;
        }
        :global(.template-configuration-section .template-doc-selector + .template-group) {
           border-top: 0;
           padding-top: 0;
        }
        :global(.template-configuration-section .template-group-title) {
           display: flex;
           align-items: center;
           gap: 8px;
           font-size: 13px;
           font-weight: 900;
           text-transform: uppercase;
           letter-spacing: 0.05em;
           color: #475569;
           line-height: 1.35;
        }
        :global(.template-configuration-section .template-group-title svg) {
           color: #f97316;
           flex: 0 0 auto;
        }
        :global(.template-configuration-section .group-desc) {
           display: block;
           color: #64748b;
           font-size: 13px;
           font-weight: 600;
           line-height: 1.45;
           margin: 0;
        }
        :global(.template-configuration-section .paper-preset-row) {
           display: flex;
           gap: 8px;
           flex-wrap: wrap;
           min-width: 0;
        }
        :global(.template-configuration-section .paper-preset-row button) {
           min-height: 40px;
           border: 1.5px solid #e2e8f0;
           background: #ffffff;
           color: #475569;
           padding: 8px 12px;
           border-radius: 8px;
           font-size: 12.5px;
           font-weight: 800;
           cursor: pointer;
           transition: all 0.2s ease;
           line-height: 1.25;
        }
        :global(.template-configuration-section .paper-preset-row button:hover),
        :global(.template-configuration-section .paper-preset-row button.active) {
           border-color: #f97316;
           background: #fff7ed;
           color: #c2410c;
        }
        :global(.template-configuration-section .template-grid-fields) {
           display: grid;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 14px;
           width: 100%;
           min-width: 0;
        }
        :global(.template-configuration-section .input-group) {
           display: flex;
           flex-direction: column;
           gap: 8px;
           min-width: 0;
        }
        :global(.template-configuration-section .group-lbl) {
           display: block;
           font-size: 13.5px;
           font-weight: 800;
           color: #334155;
           line-height: 1.35;
           margin: 0;
        }
        :global(.template-configuration-section .form-input) {
           width: 100%;
           min-width: 0;
           min-height: 48px;
           padding: 12px 16px;
           border: 1.5px solid #e2e8f0;
           border-radius: 10px;
           font-size: 15px;
           color: #0f172a;
           font-family: inherit;
           font-weight: 600;
           transition: all 0.2s;
           background: #fafbfc;
           box-sizing: border-box;
        }
        :global(.template-configuration-section .form-input:focus) {
           outline: none;
           border-color: #fb923c;
           background: white;
           box-shadow: 0 0 0 4px rgba(251,146,60,0.1);
        }
        :global(.template-configuration-section textarea.form-input) {
           resize: vertical;
           line-height: 1.5;
           min-height: 96px;
        }
        :global(.template-configuration-section .template-toggle-row),
        :global(.template-configuration-section .template-check) {
           display: flex;
           align-items: center;
           justify-content: space-between;
           gap: 12px;
           width: 100%;
           min-width: 0;
           background: #f8fafc;
           border: 1px solid #edf2f7;
           border-radius: 10px;
           color: #1e293b;
           cursor: pointer;
           font-family: inherit;
           font-weight: 800;
           text-align: left;
           box-sizing: border-box;
        }
        :global(.template-configuration-section .template-toggle-row) {
           min-height: 52px;
           padding: 12px 14px;
        }
        :global(.template-configuration-section .template-check) {
           min-height: 48px;
           padding: 10px 12px;
           font-size: 12.5px;
           line-height: 1.3;
        }
        :global(.template-configuration-section .template-check span),
        :global(.template-configuration-section .template-toggle-row span) {
           min-width: 0;
           overflow-wrap: anywhere;
        }
        :global(.template-configuration-section .template-checkbox-grid) {
           display: grid;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 10px;
           width: 100%;
           min-width: 0;
        }
        :global(.template-configuration-section .toggle-switch) {
           flex: 0 0 auto;
        }
        :global(.template-configuration-section .logo-upload-row) {
           display: flex;
           gap: 14px;
           align-items: center;
           padding: 14px;
           border: 1px dashed #cbd5e1;
           border-radius: 12px;
           background: #f8fafc;
           min-width: 0;
        }
        :global(.template-configuration-section .logo-icon-box) {
           width: 46px;
           height: 46px;
           border-radius: 12px;
           background: white;
           border: 1px solid #e2e8f0;
           display: flex;
           align-items: center;
           justify-content: center;
           color: #94a3b8;
           flex-shrink: 0;
        }
        :global(.template-configuration-section .logo-upload-copy) {
           flex: 1;
           display: flex;
           align-items: center;
           gap: 12px;
           flex-wrap: wrap;
           min-width: 0;
        }
        :global(.template-configuration-section .logo-upload-copy span),
        :global(.template-configuration-section .template-message) {
           color: #334155;
           font-size: 12px;
           font-weight: 700;
        }
        :global(.template-configuration-section .template-message) {
           display: flex;
           align-items: center;
           gap: 6px;
           line-height: 1.4;
        }
        :global(.template-configuration-section .template-message.success) {
           color: #059669;
        }
        :global(.template-configuration-section .template-message.error) {
           color: #dc2626;
        }
        :global(.template-configuration-section .logo-clear-btn) {
           background: #fef2f2;
           border: 1px solid #fee2e2;
           color: #ef4444;
           font-size: 12px;
           cursor: pointer;
           font-weight: 800;
           padding: 8px 12px;
           border-radius: 8px;
           min-height: 36px;
        }
        :global(.template-configuration-section .print-preview-panel) {
           position: sticky;
           top: 24px;
           z-index: 10;
           width: 100%;
           min-width: 0;
           max-width: 420px;
           justify-self: end;
        }
        :global(.template-configuration-section .print-preview-panel > *) {
           max-width: 100%;
        }
        @media (max-width: 1280px) {
           :global(.template-configuration-section .print-editor-layout) {
              grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
              gap: 18px;
           }
        }
        @media (max-width: 1100px) {
           :global(.template-configuration-section .print-editor-layout) {
              grid-template-columns: 1fr;
           }
           :global(.template-configuration-section .print-preview-panel) {
              position: static;
              max-width: min(100%, 420px);
              justify-self: center;
              margin-top: 8px;
           }
        }
        @media (max-width: 768px) {
           :global(.template-configuration-section) {
              padding: 16px !important;
              border-radius: 16px !important;
           }
           :global(.template-configuration-section .template-doc-selector) {
              grid-template-columns: 1fr;
           }
           :global(.template-configuration-section .template-doc-selector button) {
              justify-content: flex-start;
              text-align: left;
              min-height: 44px;
           }
           :global(.template-configuration-section .template-grid-fields),
           :global(.template-configuration-section .template-checkbox-grid) {
              grid-template-columns: 1fr;
           }
           :global(.template-configuration-section .paper-preset-row button) {
              flex: 1 1 calc(50% - 8px);
           }
           :global(.template-configuration-section .logo-upload-row) {
              align-items: flex-start;
              flex-wrap: wrap;
           }
        }
        @media (max-width: 420px) {
           :global(.template-configuration-section) {
              padding: 14px 12px !important;
           }
           :global(.template-configuration-section .paper-preset-row button) {
              flex-basis: 100%;
           }
           :global(.template-configuration-section .form-input) {
              min-height: 46px;
              font-size: 14px;
              padding: 11px 13px;
           }
           :global(.template-configuration-section .template-check),
           :global(.template-configuration-section .template-toggle-row) {
              min-height: 46px;
           }
        }

        /* ─── INFO TOOLTIP STYLES ─── */
        :global(.custom-tooltip-wrapper) {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 6px;
          vertical-align: middle;
        }
        :global(.custom-tooltip-icon) {
          color: #94a3b8;
          font-size: 13.5px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        :global(.custom-tooltip-icon:hover),
        :global(.custom-tooltip-icon.active) {
          color: #f97316;
          transform: scale(1.15);
        }
        :global(.custom-tooltip-box) {
          position: absolute;
          bottom: 135%;
          left: 50%;
          transform: translateX(-50%);
          width: 220px;
          background: #ea580c;
          color: #ffffff;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 11.5px;
          font-weight: 600;
          line-height: 1.45;
          box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3), 0 4px 6px rgba(0, 0, 0, 0.05);
          z-index: 1000;
          white-space: normal;
          text-align: left;
          animation: tooltip-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        :global(.custom-tooltip-arrow) {
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid #ea580c;
        }
        /* ─── TAX RULE MODAL STYLES ─── */
        .modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.4);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            z-index: 2000; display: flex; align-items: center; justify-content: center;
            animation: modalFadeIn 0.2s ease forwards;
        }
        .modal-card {
            background: white; border-radius: 20px; border: 1px solid #e2e8f0;
            border-top: 4px solid #f97316;
            width: 90%; max-width: 400px; padding: 24px;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
            animation: modalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .modal-header h3 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
        .close-btn { background: transparent; border: none; font-size: 16px; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; transition: all 0.2s; }
        .close-btn:hover { background: #f1f5f9; color: #0f172a; }
        .modal-body { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 12px; }
        
        @keyframes modalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes modalPop {
            from { transform: scale(0.9) translateY(10px); opacity: 0; }
            to { transform: scale(1) translateY(0); opacity: 1; }
        }


        .modal-section-title {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 2px;
        }
        .modal-rules-list {
            max-height: 180px;
            overflow-y: auto;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            background: #f8fafc;
            padding: 4px;
        }
        .modal-rule-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid #f1f5f9;
        }
        .modal-rule-row:last-child {
            border-bottom: none;
        }
        .modal-rule-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .modal-rule-name {
            font-size: 13.5px;
            font-weight: 700;
            color: #0f172a;
        }
        .modal-rule-value {
            font-size: 12px;
            color: #64748b;
            font-weight: 600;
        }
        .modal-rule-delete {
            background: transparent;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
            font-size: 14px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .modal-rule-delete:hover {
            background: #fee2e2;
            color: #ef4444;
        }
        .styled-toggle-card {
            background: #fafbfc;
            padding: 16px 20px;
            border-radius: 14px;
            border: 1.5px solid #f1f5f9;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
        }
        .styled-toggle-card:hover {
            border-color: #fed7aa;
            background: #fffcf9;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(249,115,22,0.02);
        }
        .row-icon-small {
            width: 36px; height: 36px; border-radius: 10px; background: #fff5ed; color: #f97316;
            display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;
            box-shadow: inset 0 -1.5px 0 rgba(0,0,0,0.05);
        }
        .btn-secondary {
            background: #fff5eb !important;
            color: #ea580c !important;
            border: 1.5px solid #fed7aa !important;
            padding: 8px 16px !important;
            height: 34px !important;
            border-radius: 8px !important;
            font-weight: 700 !important;
            font-size: 12.5px !important;
            cursor: pointer !important;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
            white-space: nowrap !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        .btn-secondary:hover {
            background: #ffedd5 !important;
            border-color: #f97316 !important;
            color: #c2410c !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 8px rgba(249,115,22,0.05) !important;
        }
        .form-input {
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .form-input:focus {
            border-color: #f97316 !important;
            box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1) !important;
        }
        .form-card {
            position: relative;
            overflow: hidden;
            border-top: 4px solid #f97316 !important;
            border-radius: 20px !important;
            box-shadow: 0 10px 30px -5px rgba(0,0,0,0.02), 0 1px 3px rgba(0,0,0,0.01) !important;
        }
        :global(.template-configuration-section.form-card) {
            overflow: visible;
        }
      `}</style>
    </DashboardLayout>
  );
}

const InfoTooltip = ({ id, text, activeTooltip, setActiveTooltip }) => {
  const isOpen = activeTooltip === id;
  const ref = React.useRef(null);
  const [coords, setCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
  const [arrowCoords, setArrowCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });

  useEffect(() => {
    if (isOpen) {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        
        if (rect.left < 16) {
          setCoords({ left: '-16px', transform: 'none', right: 'auto' });
          setArrowCoords({ left: '20px', transform: 'none', right: 'auto' });
        } else if (rect.right > screenWidth - 16) {
          setCoords({ right: '-16px', left: 'auto', transform: 'none' });
          setArrowCoords({ right: '20px', left: 'auto', transform: 'none' });
        } else {
          setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
          setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
        }
      }
    } else {
      setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
      setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
    }
  }, [isOpen]);

  return (
    <span
      className="custom-tooltip-wrapper"
      onMouseEnter={() => {
        if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
          setActiveTooltip(id);
        }
      }}
      onMouseLeave={() => {
        if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
          if (activeTooltip === id) setActiveTooltip(null);
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        setActiveTooltip(isOpen ? null : id);
      }}
    >
      <FaInfoCircle className={`custom-tooltip-icon ${isOpen ? 'active' : ''}`} />
      {isOpen && (
        <span ref={ref} className="custom-tooltip-box" style={coords} onClick={(e) => e.stopPropagation()}>
          {text}
          <span className="custom-tooltip-arrow" style={arrowCoords} />
        </span>
      )}
    </span>
  );
};
