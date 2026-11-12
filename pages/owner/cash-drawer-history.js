import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Cookies from 'js-cookie';
import { FaDownload, FaListUl, FaUsers } from 'react-icons/fa';
import DashboardLayout from '../../components/DashboardLayout';
import { PageContainer } from '../../components/PremiumPOSUI';
import {
  HistoryShell,
  HistoryToolbar,
  HistFilterWrap,
  HistTableWrap,
  HistTable,
  HistRow,
  HistRowDate,
  HistStatusBadge,
  HistActionBtn,
  HistPager,
  HistPagerBtn,
  SegmentedWrapper,
  SegmentBtn,
} from '../../components/PremiumOrdersUI';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import NiceSelect from '../../components/NiceSelect';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyDecimals } from '../../hooks/useCurrencyConfig';
import { useCurrencySymbol } from '../../hooks/useCurrencySymbol';
import api from '../../utils/api';
import { businessTimeToUtc, formatTzDate, getBusinessNow } from '../../utils/timezoneUtils';
import { describeDrawerError, flushCashDrawerEventQueue } from '../../utils/cashDrawer';

const TRIGGER_LABELS = {
  SALE_SETTLE: 'POS sale',
  ORDER_SETTLE: 'Kitchen / table order',
  MANUAL: 'Manual (No Sale)',
  TEST: 'Hardware test',
};

const TRIGGER_STYLE = {
  SALE_SETTLE: { color: '#15803d', background: '#f0fdf4', borderColor: '#bbf7d0' },
  ORDER_SETTLE: { color: '#0f766e', background: '#f0fdfa', borderColor: '#99f6e4' },
  MANUAL: { color: '#b45309', background: '#fffbeb', borderColor: '#fde68a' },
  TEST: { color: '#4338ca', background: '#eef2ff', borderColor: '#c7d2fe' },
};

// Opens the server recorded but flagged because they broke a rule (the device kicks before the server sees it).
const VIOLATION_LABELS = {
  NOT_PERMITTED: 'Role not permitted',
  REASON_MISSING: 'No reason given',
};

const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 10000;

function toInputValue(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function defaultRange(timezone) {
  const tz = timezone || (typeof window !== 'undefined' ? Cookies.get('timezone') : null) || 'Asia/Kolkata';
  const now = getBusinessNow(tz);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 0, 0);
  return { from: toInputValue(from), to: toInputValue(to) };
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Pagination({ page, totalPages, totalElements, loading, onChange, noun }) {
  if (!totalElements) return null;
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, totalElements);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px',
      borderTop: '1px solid #f1f5f9', background: '#ffffff', flexWrap: 'wrap', gap: 12, borderRadius: '0 0 20px 20px',
    }}>
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
        Showing <strong>{start}</strong>–<strong>{end}</strong> of <strong>{totalElements}</strong> {noun}
      </span>
      <HistPager style={{ margin: 0 }}>
        <HistPagerBtn type="button" disabled={loading || page <= 0} onClick={() => onChange(page - 1)}>Previous</HistPagerBtn>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', padding: '0 4px' }}>
          Page {totalPages ? page + 1 : 0} of {totalPages}
        </span>
        <HistPagerBtn type="button" disabled={loading || !totalPages || page >= totalPages - 1} onClick={() => onChange(page + 1)}>Next</HistPagerBtn>
      </HistPager>
    </div>
  );
}

export default function CashDrawerHistoryPage() {
  const { timezone, userRole, canViewCashDrawerHistory, loading: authLoading } = useAuth();
  const dp = useCurrencyDecimals();
  const sym = useCurrencySymbol();
  const allowed = canViewCashDrawerHistory === true || ['ADMIN', 'SUPER_ADMIN'].includes(String(userRole || '').toUpperCase());

  const [view, setView] = useState('events'); // 'events' | 'users'
  const [filters, setFilters] = useState(null);
  const [eventsPage, setEventsPage] = useState({ number: 0, totalPages: 0, totalElements: 0, content: [] });
  const [summary, setSummary] = useState([]);
  const [usersPage, setUsersPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setFilters((f) => f || { ...defaultRange(timezone), userId: '', triggerType: '', status: '' });
  }, [timezone]);

  const rangeParams = useCallback((f) => ({
    from: f.from ? businessTimeToUtc(f.from, timezone) : undefined,
    to: f.to ? businessTimeToUtc(f.to, timezone) : undefined,
  }), [timezone]);

  const eventParams = useCallback((f, extra) => {
    const p = { ...rangeParams(f), ...extra };
    if (f.userId) p.userId = f.userId;
    if (f.triggerType) p.triggerType = f.triggerType;
    if (f.status) p.status = f.status;
    return p;
  }, [rangeParams]);

  const fetchEvents = useCallback(async (page, f) => {
    const resp = await api.get('/api/v1/cash-drawer/events', { params: eventParams(f, { page, size: PAGE_SIZE }) });
    const data = resp?.data?.data || {};
    setEventsPage({
      number: data.number ?? page,
      totalPages: data.totalPages || 0,
      totalElements: data.totalElements || 0,
      content: Array.isArray(data.content) ? data.content : [],
    });
  }, [eventParams]);

  const fetchSummary = useCallback(async (f) => {
    const resp = await api.get('/api/v1/cash-drawer/events/summary', { params: rangeParams(f) });
    setSummary(Array.isArray(resp?.data?.data) ? resp.data.data : []);
    setUsersPage(0);
  }, [rangeParams]);

  const reload = useCallback(async (f, page = 0) => {
    if (!f || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      await flushCashDrawerEventQueue().catch(() => {});
      await Promise.all([fetchEvents(page, f), fetchSummary(f)]);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to load cash drawer history');
    } finally {
      setLoading(false);
    }
  }, [allowed, fetchEvents, fetchSummary]);

  useEffect(() => { if (filters) reload(filters, 0); }, [filters, reload]);

  const goToEventsPage = async (page) => {
    setLoading(true);
    try {
      await fetchEvents(page, filters);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const money = (v) => (v === null || v === undefined || v === '' ? '—' : `${sym}${Number(v).toFixed(dp)}`);

  const userOptions = useMemo(() => [
    { value: '', label: 'All Users' },
    ...summary.filter((s) => s.userId).map((s) => ({ value: s.userId, label: s.userName || 'Unknown user' })),
  ], [summary]);

  const userTotalPages = Math.ceil(summary.length / PAGE_SIZE);
  const userRows = summary.slice(usersPage * PAGE_SIZE, (usersPage + 1) * PAGE_SIZE);

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      let lines;
      if (view === 'users') {
        lines = [['User', 'Total', 'POS sale', 'Kitchen / table order', 'Manual (No Sale)', 'Test', 'Failed'].join(',')]
          .concat(summary.map((s) => [s.userName, s.total, s.saleSettle, s.orderSettle, s.manual, s.test, s.failed].map(csvCell).join(',')));
      } else {
        const all = [];
        for (let p = 0; all.length < EXPORT_MAX_ROWS; p += 1) {
          const resp = await api.get('/api/v1/cash-drawer/events', { params: eventParams(filters, { page: p, size: EXPORT_PAGE_SIZE }) });
          const data = resp?.data?.data || {};
          all.push(...(data.content || []));
          if (p + 1 >= (data.totalPages || 0)) break;
        }
        lines = [['Recorded at', 'Device time', 'User', 'Role', 'Terminal', 'Trigger', 'Reason', 'Order', 'Tender', 'Amount', 'Status', 'Error', 'Transport', 'Policy flag'].join(',')]
          .concat(all.map((r) => [
            formatTzDate(r.recordedAt, timezone, { format: 'full' }),
            r.deviceEventAt ? formatTzDate(r.deviceEventAt, timezone, { format: 'full' }) : '',
            r.userName, r.roleName, r.terminalName || r.deviceLabel, TRIGGER_LABELS[r.triggerType] || r.triggerType,
            r.reason, r.orderNo, r.paymentMethod, r.amount, r.status === 'SENT' ? 'Opened' : 'Failed', r.errorMessage ? describeDrawerError(r.errorMessage).split('. ')[0] : '', r.transport,
            r.policyViolation ? (VIOLATION_LABELS[r.policyViolation] || r.policyViolation) : '',
          ].map(csvCell).join(',')));
      }
      const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cash-drawer-${view === 'users' ? 'per-user' : 'opens'}_${(filters.from || '').slice(0, 10)}_${(filters.to || '').slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!authLoading && !allowed) {
    return (
      <DashboardLayout title="Cash Drawer History" showBack={true} backUrl="/owner/main-menu">
        <PageContainer style={{ padding: '16px 20px' }}>
          <div style={{ padding: 24, color: '#64748b' }}>Your role does not have access to Cash Drawer History.</div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  const nothingToExport = view === 'users' ? summary.length === 0 : eventsPage.totalElements === 0;

  return (
    <DashboardLayout title="Cash Drawer History" showBack={true} backUrl="/owner/main-menu">
      <Head><title>Cash Drawer History</title></Head>
      <PageContainer style={{ padding: '16px 20px' }}>
        <HistoryShell style={{ padding: 0 }}>

          {/* View switch */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: 16 }}>
            <SegmentedWrapper>
              <SegmentBtn type="button" $active={view === 'events'} $accent="#0f172a" onClick={() => setView('events')}>
                <FaListUl /> Drawer Opens <span className="badge">{eventsPage.totalElements}</span>
              </SegmentBtn>
              <SegmentBtn type="button" $active={view === 'users'} $accent="#0f172a" onClick={() => setView('users')}>
                <FaUsers /> Per User <span className="badge">{summary.length}</span>
              </SegmentBtn>
            </SegmentedWrapper>
          </div>

          {/* Filters */}
          <HistoryToolbar>
            <HistFilterWrap>
              <div className="hist-dates">
                <PremiumDateTimePicker value={filters?.from || ''} onChange={(val) => updateFilter('from', val)} themeColor="#f97316" />
                <span className="h-filter-sep">to</span>
                <PremiumDateTimePicker value={filters?.to || ''} onChange={(val) => updateFilter('to', val)} themeColor="#f97316" />
              </div>

              {view === 'events' && (
                <>
                  <NiceSelect className="nice-select" options={userOptions} value={filters?.userId || ''} onChange={(v) => updateFilter('userId', v)} />
                  <NiceSelect
                    className="nice-select"
                    options={[{ value: '', label: 'All Triggers' }, ...Object.entries(TRIGGER_LABELS).map(([value, label]) => ({ value, label }))]}
                    value={filters?.triggerType || ''}
                    onChange={(v) => updateFilter('triggerType', v)}
                  />
                  <NiceSelect
                    className="nice-select"
                    options={[{ value: '', label: 'All Status' }, { value: 'SENT', label: 'Opened' }, { value: 'FAILED', label: 'Failed' }]}
                    value={filters?.status || ''}
                    onChange={(v) => updateFilter('status', v)}
                  />
                </>
              )}

              <HistActionBtn
                type="button"
                $tone="orange"
                onClick={exportCsv}
                disabled={exporting || nothingToExport}
                style={{ marginLeft: 'auto', height: 30, padding: '0 14px', borderRadius: 12 }}
              >
                <FaDownload size={11} /> {exporting ? 'Exporting…' : 'Export CSV'}
              </HistActionBtn>
            </HistFilterWrap>
          </HistoryToolbar>

          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {view === 'events' ? (
            <HistTableWrap style={{ marginBottom: 0 }}>
              <HistTable>
                <thead>
                  <tr>
                    <th>When</th><th>User</th><th>Terminal</th><th>Trigger</th>
                    <th>Reason / Order</th><th>Tender</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsPage.content.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                      {loading ? 'Loading…' : 'No drawer opens match these filters.'}
                    </td></tr>
                  )}
                  {eventsPage.content.map((r) => {
                    const drift = r.deviceEventAt && r.recordedAt
                      && Math.abs(new Date(`${r.recordedAt}Z`) - new Date(`${r.deviceEventAt}Z`)) > 5 * 60 * 1000;
                    return (
                      <HistRow key={r.id}>
                        <td>
                          <HistRowDate>
                            <span className="rd-d">{formatTzDate(r.recordedAt, timezone, { format: 'date' })}</span>
                            <span className="rd-t">{formatTzDate(r.recordedAt, timezone, { format: 'time', second: '2-digit' })}</span>
                            {drift && (
                              <span className="rd-t" title="Recorded after the device came back online">
                                device: {formatTzDate(r.deviceEventAt, timezone, { format: 'short' })}
                              </span>
                            )}
                          </HistRowDate>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{r.userName || '—'}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.roleName || ''}</div>
                        </td>
                        <td>{r.terminalName || r.deviceLabel || '—'}</td>
                        <td>
                          <HistStatusBadge style={TRIGGER_STYLE[r.triggerType] || {}}>{TRIGGER_LABELS[r.triggerType] || r.triggerType}</HistStatusBadge>
                        </td>
                        <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>{r.reason || (r.orderNo ? `Order ${r.orderNo}` : '—')}</td>
                        <td>{r.paymentMethod || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>{money(r.amount)}</td>
                        <td>
                          {r.status === 'SENT' ? (
                            <HistStatusBadge style={{ color: '#15803d', background: '#f0fdf4', borderColor: '#bbf7d0' }}>Opened</HistStatusBadge>
                          ) : (
                            <>
                              <HistStatusBadge style={{ color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca' }} title={r.errorMessage || ''}>Failed</HistStatusBadge>
                              {r.errorMessage && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4, whiteSpace: 'normal', maxWidth: 240 }} title={r.errorMessage}>{describeDrawerError(r.errorMessage).split('. ')[0]}.</div>}
                            </>
                          )}
                          {r.policyViolation && (
                            <div style={{ marginTop: 4 }}>
                              <HistStatusBadge
                                style={{ color: '#b45309', background: '#fffbeb', borderColor: '#fde68a' }}
                                title="This open broke a cash drawer rule. It was recorded and flagged for review."
                              >
                                {VIOLATION_LABELS[r.policyViolation] || r.policyViolation}
                              </HistStatusBadge>
                            </div>
                          )}
                        </td>
                      </HistRow>
                    );
                  })}
                </tbody>
              </HistTable>
              <Pagination
                page={eventsPage.number}
                totalPages={eventsPage.totalPages}
                totalElements={eventsPage.totalElements}
                loading={loading}
                onChange={goToEventsPage}
                noun="drawer opens"
              />
            </HistTableWrap>
          ) : (
            <HistTableWrap style={{ marginBottom: 0 }}>
              <HistTable style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th>User</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>POS sale</th>
                    <th style={{ textAlign: 'right' }}>Kitchen / table</th><th style={{ textAlign: 'right' }}>Manual (No Sale)</th>
                    <th style={{ textAlign: 'right' }}>Test</th><th style={{ textAlign: 'right' }}>Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                      {loading ? 'Loading…' : 'No drawer opens in this period.'}
                    </td></tr>
                  )}
                  {userRows.map((s) => (
                    <HistRow key={s.userId || 'unknown'}>
                      <td style={{ fontWeight: 700, color: '#1e293b' }}>{s.userName || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{s.total}</td>
                      <td style={{ textAlign: 'right' }}>{s.saleSettle}</td>
                      <td style={{ textAlign: 'right' }}>{s.orderSettle}</td>
                      <td style={{ textAlign: 'right', fontWeight: s.manual > 0 ? 800 : 400, color: s.manual > 0 ? '#b45309' : undefined }}>{s.manual}</td>
                      <td style={{ textAlign: 'right' }}>{s.test}</td>
                      <td style={{ textAlign: 'right', color: s.failed > 0 ? '#b91c1c' : undefined }}>{s.failed}</td>
                    </HistRow>
                  ))}
                </tbody>
              </HistTable>
              <Pagination
                page={usersPage}
                totalPages={userTotalPages}
                totalElements={summary.length}
                loading={loading}
                onChange={setUsersPage}
                noun="users"
              />
            </HistTableWrap>
          )}
        </HistoryShell>
      </PageContainer>
    </DashboardLayout>
  );
}
