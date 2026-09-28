let _cachedConfig = null;

export function setCachedConfig(cfg) {
  if (cfg && typeof cfg === 'object') {
    _cachedConfig = cfg;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('cafeqr_system_config', JSON.stringify(cfg));
      } catch (e) {}
    }
  }
}

export function getCachedConfig() {
  if (_cachedConfig) return _cachedConfig;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem('cafeqr_system_config');
      if (stored) {
        _cachedConfig = JSON.parse(stored);
        return _cachedConfig;
      }
    } catch (e) {}
  }
  return null;
}

const FEATURE_DEFAULTS = {
  tableManagementEnabled: true,
  inventoryEnabled: true,
  purchaseEnabled: true,
  creditEnabled: false,
  customersEnabled: false,
  loyaltyEnabled: false,
  discountEnabled: true,
  sendToKitchenEnabled: false,
  offlineSyncEnabled: true,
  payrollEnabled: true,
  posV2Enabled: false,
  partnersEnabled: false,
};

const MENU_FEATURES = {
  'Table Management': 'tableManagementEnabled',
  Stock: 'inventoryEnabled',
  'Purchase Orders': 'purchaseEnabled',
  'Purchase Reports': 'purchaseEnabled',
  'Purchases & Reports': 'purchaseEnabled',
  'Purchases': 'purchaseEnabled',
  'Purchasing': 'purchaseEnabled',
  'Partners': 'partnersEnabled',
  'Customers': 'customersEnabled',
  'Credit Settlements': 'creditEnabled',
  'Credit Customers': 'creditEnabled',
  'Credit Sales': 'creditEnabled',
  'Loyalty': 'loyaltyEnabled',
  'Offline Sync Center': 'offlineSyncEnabled',
  'Payroll & HR': 'payrollEnabled',
  'HR & Payroll': 'payrollEnabled',
  'Payroll': 'payrollEnabled',
  'Timesheets': 'payrollEnabled',
  'Leaves': 'payrollEnabled',
  'Advances': 'payrollEnabled',
  'Salary Components': 'payrollEnabled',
  'HR Policy Settings': 'payrollEnabled',
  'Payroll Processing': 'payrollEnabled',
  'POS (V2)': 'posV2Enabled',
  'Sales History': 'posV2Enabled',
};

const ROUTE_FEATURES = [
  { pattern: /^\/owner\/table-management(?:\/)?$/, flag: 'tableManagementEnabled', label: 'Table Management' },
  { pattern: /^\/owner\/credit-settlements(?:\/)?$/, flag: 'creditEnabled', label: 'Credit Settlements' },
  { pattern: /^\/owner\/credit-customers(?:\/)?$/, flag: 'creditEnabled', label: 'Credit Ledger' },
  { pattern: /^\/owner\/stock(?:-|\/|$)/, flag: 'inventoryEnabled', label: 'Stock and Inventory' },
  { pattern: /^\/owner\/purchase-reports(?:\/)?$/, flag: 'purchaseEnabled', label: 'Purchase Reports' },
  { pattern: /^\/owner\/purchase-orders(?:\/)?$/, flag: 'purchaseEnabled', label: 'Purchase Orders' },
  { pattern: /^\/owner\/purchases(?:\/)?$/, flag: 'purchaseEnabled', label: 'Purchase Orders' },
  { pattern: /^\/owner\/purchase(?:-|\/|$)/, flag: 'purchaseEnabled', label: 'Purchase Orders' },
  { pattern: /^\/owner\/partners(?:\/)?$/, flag: 'partnersEnabled', label: 'Partners' },
  { pattern: /^\/owner\/loyalty(?:\/)?$/, flag: 'loyaltyEnabled', label: 'Loyalty' },
  { pattern: /^\/owner\/offline-sync(?:\/)?$/, flag: 'offlineSyncEnabled', label: 'Offline Sync Center' },
  { pattern: /^\/owner\/hr(?:-|\/|$)/, flag: 'payrollEnabled', label: 'Payroll & HR' },
  { pattern: /^\/owner\/pos-sales(?:\/)?$/, flag: 'posV2Enabled', label: 'POS (V2)' },
  { pattern: /^\/owner\/sales-history(?:\/)?$/, flag: 'posV2Enabled', label: 'Sales History' },
];

export function isPosV2Enabled(config) {
  if (!config) return false;
  const version = (config.salesVersion || config.sales_version || '').toLowerCase();
  if (version === 'v2') return true;
  if (version === 'v1' || version === 'classic' || version === 'old') return false;
  return config.posV2Enabled === true || config.pos_v2_enabled === true;
}

export function isPartnersModuleEnabled(config) {
  const cfg = config || getCachedConfig();
  if (!cfg) {
    return Boolean(FEATURE_DEFAULTS.purchaseEnabled || FEATURE_DEFAULTS.customersEnabled);
  }
  const isPurchaseOn = isFeatureEnabled(cfg, 'purchaseEnabled');
  const isCustomersOn = isCustomersModuleEnabled(cfg);
  return Boolean(isPurchaseOn || isCustomersOn);
}

export function isFeatureEnabled(config, flag) {
  if (!flag) return true;
  const effectiveConfig = config || getCachedConfig();
  if (!effectiveConfig) {
    return FEATURE_DEFAULTS[flag] !== false;
  }
  if (flag === 'partnersEnabled') {
    return isPartnersModuleEnabled(effectiveConfig);
  }
  if (flag === 'posV2Enabled') {
    return isPosV2Enabled(effectiveConfig);
  }
  if (flag === 'customersEnabled') {
    if (effectiveConfig.customersEnabled === false || effectiveConfig.customersEnabled === 'false') return false;
    if (effectiveConfig.pm_customers === false || effectiveConfig.pm_customers === 'false') return false;
    if (effectiveConfig.customersEnabled === true || effectiveConfig.customersEnabled === 'true') return true;
    if (effectiveConfig.pm_customers === true || effectiveConfig.pm_customers === 'true') return true;
    return FEATURE_DEFAULTS.customersEnabled !== false;
  }
  if (flag === 'purchaseEnabled') {
    if (effectiveConfig.purchaseEnabled === false || effectiveConfig.purchaseEnabled === 'false') return false;
    if (effectiveConfig.pm_purchase === false || effectiveConfig.pm_purchase === 'false') return false;
    if (effectiveConfig.purchaseEnabled === true || effectiveConfig.purchaseEnabled === 'true') return true;
    if (effectiveConfig.pm_purchase === true || effectiveConfig.pm_purchase === 'true') return true;
    return FEATURE_DEFAULTS.purchaseEnabled !== false;
  }
  if (typeof effectiveConfig[flag] === 'undefined' || effectiveConfig[flag] === null) {
    return FEATURE_DEFAULTS[flag] !== false;
  }
  return effectiveConfig[flag] !== false;
}

export function isMenuVisibleForConfig(menu, config) {
  const name = typeof menu === 'string' ? menu : menu?.name;
  if (name === 'Partners') {
    return isPartnersModuleEnabled(config);
  }
  if (name === 'Customers') {
    return isCustomersModuleEnabled(config);
  }
  return isFeatureEnabled(config, MENU_FEATURES[name]);
}

export function getRouteModuleGate(pathname) {
  return ROUTE_FEATURES.find(({ pattern }) => pattern.test(pathname || '')) || null;
}

export function isRouteVisibleForConfig(pathname, config) {
  const gate = getRouteModuleGate(pathname);
  if (!gate) return true;
  if (gate.flag === 'partnersEnabled') {
    return isPartnersModuleEnabled(config);
  }
  return isFeatureEnabled(config, gate.flag);
}

export function getModuleLabelForPath(pathname) {
  return getRouteModuleGate(pathname)?.label || 'This module';
}

export function isCustomersModuleEnabled(config) {
  const effectiveConfig = config || getCachedConfig();
  if (!effectiveConfig) return FEATURE_DEFAULTS.customersEnabled !== false;
  if (effectiveConfig.customersEnabled === false || effectiveConfig.customersEnabled === 'false') return false;
  if (effectiveConfig.pm_customers === false || effectiveConfig.pm_customers === 'false') return false;
  if (effectiveConfig.customersEnabled === true || effectiveConfig.customersEnabled === 'true') return true;
  if (effectiveConfig.pm_customers === true || effectiveConfig.pm_customers === 'true') return true;
  return isFeatureEnabled(effectiveConfig, 'customersEnabled');
}

export function isDiscountModuleEnabled(config) {
  return isFeatureEnabled(config, 'discountEnabled');
}

export function isKitchenModuleEnabled(config) {
  if (!config) return false;
  if (config.sendToKitchenEnabled === false || config.sendToKitchenEnabled === 'false') return false;
  if (config.pm_send_to_kitchen === false || config.pm_send_to_kitchen === 'false') return false;
  if (config.sendToKitchenEnabled === true || config.sendToKitchenEnabled === 'true') return true;
  if (config.pm_send_to_kitchen === true || config.pm_send_to_kitchen === 'true') return true;
  return isFeatureEnabled(config, 'sendToKitchenEnabled');
}

export function isLoyaltyModuleEnabled(config) {
  return isFeatureEnabled(config, 'loyaltyEnabled');
}
