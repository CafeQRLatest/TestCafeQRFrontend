import {
  isMenuVisibleForConfig,
  isRouteVisibleForConfig,
  getModuleLabelForPath,
  isFeatureEnabled,
  isCashDrawerModuleEnabled,
  setCachedConfig,
} from '../moduleVisibility';

describe('Cash Drawer Visibility and Route Access', () => {
  beforeEach(() => {
    setCachedConfig(null);
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  describe('isCashDrawerModuleEnabled helper', () => {
    it('returns true when cashDrawerEnabled is true', () => {
      expect(isCashDrawerModuleEnabled({ cashDrawerEnabled: true })).toBe(true);
    });

    it('returns false when cashDrawerEnabled is false', () => {
      expect(isCashDrawerModuleEnabled({ cashDrawerEnabled: false })).toBe(false);
    });

    it('returns true when pm_cash_drawer is true', () => {
      expect(isCashDrawerModuleEnabled({ pm_cash_drawer: true })).toBe(true);
    });

    it('returns false when pm_cash_drawer is false', () => {
      expect(isCashDrawerModuleEnabled({ pm_cash_drawer: false })).toBe(false);
    });

    it('defaults to false for new clients with empty/missing config', () => {
      expect(isCashDrawerModuleEnabled({})).toBe(false);
      expect(isCashDrawerModuleEnabled(null)).toBe(false);
    });
  });

  describe('Sidepanel menu item visibility (isMenuVisibleForConfig)', () => {
    it('shows Cash Drawer History when cashDrawerEnabled is true', () => {
      expect(isMenuVisibleForConfig('Cash Drawer History', { cashDrawerEnabled: true })).toBe(true);
      expect(isMenuVisibleForConfig({ name: 'Cash Drawer History' }, { cashDrawerEnabled: true })).toBe(true);
    });

    it('hides Cash Drawer History when cashDrawerEnabled is false', () => {
      expect(isMenuVisibleForConfig('Cash Drawer History', { cashDrawerEnabled: false })).toBe(false);
      expect(isMenuVisibleForConfig({ name: 'Cash Drawer History' }, { cashDrawerEnabled: false })).toBe(false);
    });

    it('shows Cash Drawer History when pm_cash_drawer is true', () => {
      expect(isMenuVisibleForConfig('Cash Drawer History', { pm_cash_drawer: true })).toBe(true);
    });

    it('hides Cash Drawer History when pm_cash_drawer is false', () => {
      expect(isMenuVisibleForConfig('Cash Drawer History', { pm_cash_drawer: false })).toBe(false);
    });

    it('hides Cash Drawer History by default for new clients', () => {
      expect(isMenuVisibleForConfig('Cash Drawer History', {})).toBe(false);
      expect(isMenuVisibleForConfig({ name: 'Cash Drawer History' }, null)).toBe(false);
    });
  });

  describe('Route protection and gating (isRouteVisibleForConfig)', () => {
    it('allows route /owner/cash-drawer-history when cashDrawerEnabled is true', () => {
      expect(isRouteVisibleForConfig('/owner/cash-drawer-history', { cashDrawerEnabled: true })).toBe(true);
      expect(isRouteVisibleForConfig('/owner/cash-drawer-history/', { cashDrawerEnabled: true })).toBe(true);
    });

    it('blocks route /owner/cash-drawer-history when cashDrawerEnabled is false', () => {
      expect(isRouteVisibleForConfig('/owner/cash-drawer-history', { cashDrawerEnabled: false })).toBe(false);
      expect(isRouteVisibleForConfig('/owner/cash-drawer-history/', { cashDrawerEnabled: false })).toBe(false);
    });

    it('blocks route /owner/cash-drawer-history by default for new clients', () => {
      expect(isRouteVisibleForConfig('/owner/cash-drawer-history', {})).toBe(false);
      expect(isRouteVisibleForConfig('/owner/cash-drawer-history', null)).toBe(false);
    });

    it('returns standard label "Cash Drawer History" for the route', () => {
      expect(getModuleLabelForPath('/owner/cash-drawer-history')).toBe('Cash Drawer History');
    });
  });
});

