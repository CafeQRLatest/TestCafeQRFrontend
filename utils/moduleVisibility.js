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
};

const MENU_FEATURES = {
  'Table Management': 'tableManagementEnabled',
  Stock: 'inventoryEnabled',
  'Purchase Orders': 'purchaseEnabled',
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
  { pattern: /^\/owner\/purchase-orders(?:\/)?$/, flag: 'purchaseEnabled', label: 'Purchase Orders' },
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

export function isFeatureEnabled(config, flag) {
  if (!flag) return true;
  if (!config) return true;
  if (flag === 'posV2Enabled') {
    return isPosV2Enabled(config);
  }
  if (typeof config[flag] === 'undefined' || config[flag] === null) {
    return FEATURE_DEFAULTS[flag] !== false;
  }
  return config[flag] !== false;
}

export function isMenuVisibleForConfig(menu, config) {
  const name = typeof menu === 'string' ? menu : menu?.name;
  return isFeatureEnabled(config, MENU_FEATURES[name]);
}

export function getRouteModuleGate(pathname) {
  return ROUTE_FEATURES.find(({ pattern }) => pattern.test(pathname || '')) || null;
}

export function isRouteVisibleForConfig(pathname, config) {
  const gate = getRouteModuleGate(pathname);
  return !gate || isFeatureEnabled(config, gate.flag);
}

export function getModuleLabelForPath(pathname) {
  return getRouteModuleGate(pathname)?.label || 'This module';
}

export function isCustomersModuleEnabled(config) {
  return isFeatureEnabled(config, 'customersEnabled');
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
