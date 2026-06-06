const FEATURE_DEFAULTS = {
  tableManagementEnabled: true,
  inventoryEnabled: true,
  creditEnabled: false,
  customersEnabled: false,
  discountEnabled: true,
  sendToKitchenEnabled: true,
};

const MENU_FEATURES = {
  'Table Management': 'tableManagementEnabled',
  Stock: 'inventoryEnabled',
  'Credit Customers': 'creditEnabled',
  'Credit Sales': 'creditEnabled',
};

const ROUTE_FEATURES = [
  { pattern: /^\/owner\/table-management(?:\/)?$/, flag: 'tableManagementEnabled', label: 'Table Management' },
  { pattern: /^\/owner\/credit-customers(?:\/)?$/, flag: 'creditEnabled', label: 'Credit Ledger' },
  { pattern: /^\/owner\/stock(?:-|\/|$)/, flag: 'inventoryEnabled', label: 'Stock and Inventory' },
];

export function isFeatureEnabled(config, flag) {
  if (!flag) return true;
  if (!config) return true;
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
  return isFeatureEnabled(config, 'sendToKitchenEnabled');
}
