import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../components/DashboardLayout';
import PosSaleContainer from '../../components/PosSale';
import PosOrderTypeModal from '../../components/PosOrderTypeModal';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { fetchSalesScreenDetails, fetchBootstrap, fetchSaleConfigurations } from '../../components/PosSale/services/posSaleApi';

import { isKitchenModuleEnabled } from '../../utils/moduleVisibility';
import NiceSelect from '../../components/NiceSelect';
import { FaExclamationCircle } from 'react-icons/fa';

export default function PosSalesPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, orgId, switchBranch } = useAuth();

  const [activeView, setActiveView] = useState('loading'); // 'loading' | 'order_type' | 'billing' | 'branch_select'
  const [config, setConfig] = useState(null);
  const [bootstrapData, setBootstrapData] = useState(null);
  const [tables, setTables] = useState([]);
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [branches, setBranches] = useState([]);

  const isMountedRef = useRef(true);
  const isPopStateRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch available branches
  useEffect(() => {
    async function loadBranches() {
      try {
        const res = await api.get('/api/v1/organizations');
        const list = res.data?.data || [];
        if (Array.isArray(list) && isMountedRef.current) {
          setBranches(list);
          // If only 1 branch exists and orgId is not set, auto-switch to it
          if (!orgId && list.length === 1 && switchBranch) {
            switchBranch(list[0].id, list[0].name);
          }
        }
      } catch (_) {}
    }
    if (isAuthenticated) {
      loadBranches();
    }
  }, [isAuthenticated, orgId, switchBranch]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch active tables from backend
  const fetchActiveTables = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/tables/active');
      const list = res.data?.data || [];
      if (Array.isArray(list) && isMountedRef.current) {
        setTables(list);
      }
      return list;
    } catch (err) {
      console.warn('Failed to fetch active tables:', err?.message || err);
      return [];
    }
  }, []);

  // Bootstrap configuration and initial routing
  useEffect(() => {
    if (!isAuthenticated) return;

    if (!orgId) {
      if (!authLoading && isMountedRef.current) {
        setActiveView('branch_select');
      }
      return;
    }

    let cancelled = false;

    async function bootstrapPos() {
      if (isMountedRef.current) {
        setActiveView('loading');
      }

      try {
        // 1. Kick off full sales screen details in parallel
        const detailsPromise = fetchSalesScreenDetails().catch(bootstrapErr => {
          console.warn('Sales screen details background fetch:', bootstrapErr?.message || bootstrapErr);
          return null;
        });

        // 2. Fast-load configurations & active tables concurrently for instant Order Type Panel display (< 100ms)
        let cfg = null;
        const [configRes, tablesRes] = await Promise.allSettled([
          fetchSaleConfigurations().catch(() => null),
          fetchActiveTables().catch(() => [])
        ]);

        if (configRes.status === 'fulfilled' && configRes.value) {
          cfg = configRes.value;
        }

        // Hydrate full bootstrap data in state when ready
        detailsPromise.then((details) => {
          if (!cancelled && isMountedRef.current && details) {
            setBootstrapData(details);
            if (!cfg && details.configuration) {
              cfg = details.configuration;
              setConfig(cfg);
            }
            if (Array.isArray(details.tables) && details.tables.length > 0) {
              setTables(details.tables);
            }
          }
        });

        // If fast config failed, await detailsPromise
        if (!cfg) {
          const details = await detailsPromise;
          if (details) {
            cfg = details.configuration || null;
            if (Array.isArray(details.tables) && details.tables.length > 0) {
              setTables(details.tables);
            }
            setBootstrapData(details);
          }
        }

        // Fallback or hydrate if sendToKitchenEnabled is not present
        if (!cfg || typeof cfg.sendToKitchenEnabled === 'undefined') {
          try {
            const res = await api.get('/api/v1/configurations');
            const data = res.data?.data;
            if (data) {
              cfg = { ...(data || {}), ...(cfg || {}) };
              if (typeof data.sendToKitchenEnabled !== 'undefined') {
                cfg.sendToKitchenEnabled = data.sendToKitchenEnabled;
              }
            }
          } catch (_) {}
        }

        if (cancelled || !isMountedRef.current) return;

        setConfig(cfg);

        const isSendToKitchenOn = isKitchenModuleEnabled(cfg);

        // 3. In New Sales: Always make Board view default!
        setSelectedTable(null);
        setActiveView('order_type');
      } catch (err) {
        console.error('Failed to initialize POS V2 bootstrap:', err);
        if (!cancelled && isMountedRef.current) {
          // Default fallback: Always make board default in New Sales
          setSelectedTable(null);
          setActiveView('order_type');
        }
      }
    }

    bootstrapPos();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, orgId, fetchActiveTables]);

  const isSendToKitchenOn = isKitchenModuleEnabled(config);
  const isTableManagementOn = Boolean(config?.tableManagementEnabled ?? config?.tableEnabled);
  const needsOrderTypeModal = true; // Always return to Board view in New Sales

  // Ensure that if no table is selected, we always stay on Board view
  useEffect(() => {
    if (activeView === 'billing' && !selectedTable) {
      setActiveView('order_type');
    }
  }, [activeView, selectedTable]);

  // Browser back-button handling
  useEffect(() => {
    if (typeof window === 'undefined' || !needsOrderTypeModal) return;

    const handlePopState = () => {
      isPopStateRef.current = true;
      if (activeView === 'billing') {
        if (isTableManagementOn) {
          fetchActiveTables();
        }
        setSelectedTable(null);
        setActiveView('order_type');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeView, needsOrderTypeModal, isTableManagementOn, fetchActiveTables]);

  const handleOrderTypeSelected = useCallback(({ orderType, table }) => {
    if (orderType === 'TABLE' && table) {
      const status = String(table.status || 'AVAILABLE').toUpperCase();
      if (status !== 'AVAILABLE') {
        return;
      }
      setSelectedTable({
        ...table,
        orderType: 'TABLE',
      });
    } else if (orderType === 'DELIVERY') {
      setSelectedTable({
        tableNumber: 'COUNTER',
        id: null,
        orderType: 'DELIVERY',
      });
    } else {
      // TAKEAWAY or DINE_IN (counter)
      setSelectedTable({
        tableNumber: 'COUNTER',
        id: null,
        orderType: orderType || 'TAKEAWAY',
      });
    }

    // Push browser history state for seamless back button
    if (typeof window !== 'undefined' && needsOrderTypeModal) {
      window.history.pushState({ cafeqrPosView: 'billing' }, '');
    }

    setActiveView('billing');
  }, [needsOrderTypeModal]);

  const handleBackFromBilling = useCallback(() => {
    if (needsOrderTypeModal) {
      // Return to order-type / table selector and refresh tables
      if (isTableManagementOn) {
        fetchActiveTables();
      }
      setSelectedTable(null);
      setActiveView('order_type');
    } else {
      router.push('/owner/dashboard');
    }
  }, [needsOrderTypeModal, isTableManagementOn, fetchActiveTables, router]);

  const handleOrderCreated = useCallback((order) => {
    if (needsOrderTypeModal) {
      // Re-fetch tables to show updated occupancy and return to table picker
      if (isTableManagementOn) {
        fetchActiveTables();
      }
      setSelectedTable(null);
      setActiveView('order_type');
    } else {
      // Takeaway/counter mode: remain on billing view with clean state for next sale
      setSelectedTable({
        tableNumber: 'COUNTER',
        id: null,
        orderType: 'TAKEAWAY'
      });
    }
  }, [needsOrderTypeModal, isTableManagementOn, fetchActiveTables]);

  // Branch Selection Screen
  if (activeView === 'branch_select' || (!authLoading && !orgId)) {
    return (
      <DashboardLayout title="POS (V2)">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100dvh - 120px)',
          background: '#f8fafc',
          padding: '24px',
          textAlign: 'center',
          gap: '16px'
        }}>
          <FaExclamationCircle style={{ fontSize: '40px', color: '#f59e0b' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>Select a Branch</h2>
          <p style={{ color: '#64748b', maxWidth: '420px', margin: 0 }}>
            POS (V2) requires an active branch. Choose a branch below to begin taking orders.
          </p>
          {branches.length > 0 && (
            <div style={{ width: 'min(100%, 340px)', marginTop: '8px' }}>
              <NiceSelect
                options={branches.map(b => ({ value: b.id, label: b.name }))}
                value=""
                onChange={(selectedId) => {
                  const b = branches.find(x => x.id === selectedId);
                  if (switchBranch && selectedId) {
                    switchBranch(selectedId, b?.name);
                  }
                }}
              />
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Loading Screen
  if (authLoading || activeView === 'loading') {
    return (
      <DashboardLayout title="POS (V2)" hideTitle noPadding>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100dvh - 60px)',
          background: '#f8fafc',
          color: '#64748b',
          fontSize: '1rem',
          gap: '12px'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#0ea5e9',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span>Loading POS Configurations & Data...</span>
          <style jsx>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </DashboardLayout>
    );
  }

  // Order Type & Table Selection Screen
  if (activeView === 'order_type') {
    return (
      <DashboardLayout title="POS (V2)" hideTitle noPadding>
        <Head>
          <title>Select Order Type | POS (V2)</title>
        </Head>
        <PosOrderTypeModal
          tables={tables}
          config={config}
          onSelect={handleOrderTypeSelected}
          onClose={() => router.push('/owner/dashboard')}
          onRefreshTables={fetchActiveTables}
        />
      </DashboardLayout>
    );
  }

  // Main POS Billing Screen
  return (
    <DashboardLayout title="POS (V2)" hideTitle noPadding>
      <Head>
        <title>POS (V2) | Cafe QR</title>
      </Head>
      <div style={{
        width: '100%',
        height: 'calc(100dvh - 60px)',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {selectedTable && (
          <PosSaleContainer
            key={`${selectedTable.tableNumber}-${selectedTable.orderType}-${selectedTable.id || 'counter'}`}
            initialBootstrap={bootstrapData}
            initialTable={selectedTable}
            config={config}
            initialCreditCustomers={creditCustomers}
            onBack={handleBackFromBilling}
            onOrderCreated={handleOrderCreated}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
