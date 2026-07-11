import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Head from 'next/head'
import axios from 'axios'
import NiceSelect from '../../components/NiceSelect'

// ─── Config ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'founder_key'
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const EXPECTED_KEY = process.env.NEXT_PUBLIC_FOUNDER_KEY || 'cafeqr-founder-2024-secret'

// ─── Theme Colors (White Theme with Brand Orange) ─────────────────────────────
const T = {
  primary:      '#FF7A00',
  primarySoft:  '#FFF3E8',
  bg:           '#F8F9FC',
  bgWhite:      '#FFFFFF',
  bgHover:      '#FFFBF5', // Soft warm hover tint
  border:       '#E2E8F0',
  textMain:     '#0F172A',
  textSub:      '#475569',
  textMuted:    '#94A3B8',
  green:        '#10B981',
  greenSoft:    '#ECFDF5',
  red:          '#EF4444',
  redSoft:      '#FEF2F2',
  blue:         '#3B82F6',
  blueSoft:     '#EFF6FF',
  orange:       '#FF7A00',
  orangeSoft:   '#FFF3E8',
  shadow:       '0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.03)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.03)',
  shadowLg:     '0 10px 25px rgba(0,0,0,0.05)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtRupees = (paise) => {
  const amount = paise / 100
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

const STATUS_META = {
  ACTIVE:  { label: 'Active',  bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
  TRIAL:   { label: 'Trial',   bg: '#FFF3E8', color: '#FF7A00', border: '#FED7AA' },
  EXPIRED: { label: 'Expired', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  UNPAID:  { label: 'Unpaid',  bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
}
const getStatusMeta = (s) => STATUS_META[(s || '').toUpperCase()] || STATUS_META.UNPAID

const MODULE_COLORS = {
  KOT:             { color: '#FF7A00', bg: '#FFF3E8' },
  INVENTORY:       { color: '#3B82F6', bg: '#EFF6FF' },
  CRM:             { color: '#10B981', bg: '#ECFDF5' },
  CREDIT_LEDGER:   { color: '#8B5CF6', bg: '#F5F3FF' },
  TABLE_QR:        { color: '#F59E0B', bg: '#FFFBEB' },
  ONLINE_DELIVERY: { color: '#06B6D4', bg: '#ECFEFF' },
  MENU_IMAGES:     { color: '#EC4899', bg: '#FDF2F8' },
}
const getModuleColor = (name) => MODULE_COLORS[name] || { color: '#64748B', bg: '#F8FAFC' }

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, onClick }) {
  return (
    <div 
      onClick={onClick}
      style={{
        background: T.bgWhite, 
        borderRadius: 12,
        border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${accent}`,
        padding: '16px 18px',
        boxShadow: T.shadow,
        display: 'flex', 
        flexDirection: 'column', 
        gap: 4,
        transition: 'all 0.2s',
        cursor: onClick ? 'pointer' : 'default',
      }}
      className={onClick ? 'stat-card-clickable' : ''}
    >
      <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Outfit, sans-serif' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 900, color: T.textMain, lineHeight: 1.1, fontFamily: 'Outfit, sans-serif' }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: T.textMuted }}>{sub}</span>}
    </div>
  )
}

function PaymentHistoryTable({ payments }) {
  if (!payments?.length)
    return <p style={{ color: T.textMuted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No payment records.</p>
  return (
    <div className="founder-tbl-wrap" style={{ border: `1px solid ${T.border}` }}>
      <table className="founder-tbl">
        <thead>
          <tr>
            {['Date', 'Payment ID', 'Order ID', 'Amount'].map(h =>
              <th key={h} style={{ textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {payments.map(p => (
            <tr key={p.id}>
              <td style={{ color: T.textSub }}>{fmtDateTime(p.createdAt)}</td>
              <td style={{ color: T.blue, fontFamily: 'monospace', fontSize: 12 }}>{p.paymentId}</td>
              <td style={{ color: T.textMuted, fontFamily: 'monospace', fontSize: 12 }}>{p.orderId}</td>
              <td style={{ color: T.green, fontWeight: 700 }}>{fmtRupees(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }) {
  const meta = getStatusMeta(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.border}`,
      borderRadius: 999, padding: '3px 10px',
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </span>
  )
}

function ModulePill({ name }) {
  const mc = getModuleColor(name)
  return (
    <span style={{
      background: mc.bg, color: mc.color,
      border: `1px solid ${mc.color}33`,
      borderRadius: 6, padding: '2px 8px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{name.replace(/_/g, ' ')}</span>
  )
}

function RenderModulesList({ modules }) {
  if (!modules?.length) return <span style={{ color: T.textMuted, fontSize: 11 }}>None</span>
  const limit = 2
  const visible = modules.slice(0, limit)
  const extra = modules.length - limit
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {visible.map(m => <ModulePill key={m.moduleName} name={m.moduleName} />)}
      {extra > 0 && (
        <span style={{
          background: '#F1F5F9', color: '#475569',
          borderRadius: 6, padding: '2px 6px',
          fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
          border: '1px solid #E2E8F0'
        }}>+{extra}</span>
      )}
    </div>
  )
}

function ClientRow({ client, index, onToggleActive, onOpenExtendModal, onOpenPaymentModal }) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('details')

  // Deduplicate modules on the frontend
  const uniqueModules = useMemo(() => {
    const map = {}
    ;(client.subscriptionModules || []).forEach(m => {
      const existing = map[m.moduleName]
      if (!existing || m.status === 'ACTIVE' || (existing.status !== 'ACTIVE' && m.status !== 'EXPIRED')) {
        map[m.moduleName] = m
      }
    })
    return Object.values(map).sort((a, b) => a.moduleName.localeCompare(b.moduleName))
  }, [client.subscriptionModules])

  const activeModules = useMemo(() => {
    return uniqueModules.filter(m => m.status === 'ACTIVE')
  }, [uniqueModules])

  const clientDisplayName = client.name && client.name !== '—' ? client.name : 'Unnamed Business'

  return (
    <>
      <tr
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer', transition: 'background 0.12s' }}
        className={expanded ? 'expanded-tr' : ''}
      >
        {/* Client Name & Email */}
        <td style={{ padding: '12px 18px' }}>
          <div>
            <div style={{ 
              fontWeight: 700, 
              color: clientDisplayName === 'Unnamed Business' ? T.textMuted : T.textMain, 
              fontSize: 13.5, 
              fontStyle: clientDisplayName === 'Unnamed Business' ? 'italic' : 'normal',
              fontFamily: 'Outfit, sans-serif' 
            }}>{clientDisplayName}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{client.email || '—'}</div>
          </div>
        </td>

        {/* Owner Details */}
        <td style={{ padding: '12px 18px' }}>
          <div style={{ color: T.textSub, fontSize: 13 }}>{client.ownerName || '—'}</div>
          {client.phone && <div style={{ color: T.textMuted, fontSize: 11, marginTop: 1 }}>{client.phone}</div>}
        </td>

        {/* Subscription Status & Expiry combined */}
        <td style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
            <StatusBadge status={client.subscriptionStatus} />
            <div style={{ fontSize: 11, color: T.textSub }}>
              {fmtDate(client.subscriptionExpiryDate)}
              {client.daysLeft > 0 && (
                <span style={{ color: client.daysLeft < 15 ? T.red : T.textMuted, marginLeft: 4 }}>
                  ({client.daysLeft}d left)
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Modules (Compact List) */}
        <td style={{ padding: '12px 18px' }}>
          <RenderModulesList modules={activeModules} />
        </td>

        {/* Revenue */}
        <td style={{ padding: '12px 18px', textAlign: 'right' }}>
          <div style={{ color: T.green, fontWeight: 700, fontSize: 14.5, fontFamily: 'Outfit, sans-serif' }}>
            {fmtRupees(client.totalPaidPaise)}
          </div>
          <div style={{ color: T.textMuted, fontSize: 11, marginTop: 1 }}>{client.paymentCount} payment{client.paymentCount !== 1 ? 's' : ''}</div>
        </td>

        {/* Expand Toggle */}
        <td style={{ padding: '12px 18px', textAlign: 'center' }}>
          <span className="expand-trigger-btn" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 8,
            background: expanded ? T.primarySoft : T.bg,
            border: `1px solid ${expanded ? T.primary + '44' : T.border}`,
            color: expanded ? T.primary : T.textMuted, fontSize: 11,
            transition: 'all 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>▾</span>
        </td>
      </tr>

      {/* Expanded panel */}
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <div style={{
              background: '#FAFBFF',
              borderBottom: `2px solid ${T.primary}22`,
              animation: 'fadeSlideIn 0.18s ease',
            }}>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, paddingLeft: 24, background: T.bgWhite }}>
                {[
                  { id: 'details',  label: 'Client Details' },
                  { id: 'modules',  label: 'Modules' },
                  { id: 'payments', label: `Payments (${client.paymentCount})` },
                ].map(tab => (
                  <button key={tab.id}
                    onClick={e => { e.stopPropagation(); setActiveTab(tab.id) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '12px 20px', fontSize: 13, fontWeight: 600,
                      color: activeTab === tab.id ? T.primary : T.textMuted,
                      borderBottom: `2px solid ${activeTab === tab.id ? T.primary : 'transparent'}`,
                      transition: 'all 0.15s', fontFamily: 'inherit',
                    }}>{tab.label}</button>
                ))}
              </div>

              <div style={{ padding: '20px 24px' }}>

                {activeTab === 'details' && (
                  <div>
                    {/* Details Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                      {[
                        ['Business Name', client.name], ['Legal Name', client.legalName],
                        ['Owner', client.ownerName], ['Email', client.email], ['Phone', client.phone],
                        ['Country', client.country], ['Currency', client.currency], ['Timezone', client.timezone],
                        ['POS Type', client.posType], ['Address', client.address], ['Website', client.website],
                        ['Primary Language', client.primaryLanguage], ['Pin Code', client.pinCode],
                        ['PAN', client.panNumber], ['GST', client.gstNumber], ['FSSAI', client.fssaiNumber],
                        ['Instagram', client.instagramUrl], ['Facebook', client.facebookUrl],
                        ['WhatsApp', client.whatsappNumber], ['Bank', client.bankName],
                        ['Account No.', client.accountNumber], ['IFSC', client.ifscCode],
                        ['Registered', fmtDate(client.createdAt)], ['Last Updated', fmtDate(client.updatedAt)],
                      ].map(([k, v]) => v ? (
                        <div key={k} style={{ background: T.bgWhite, borderRadius: 12, padding: '10px 14px', border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
                          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                          <div style={{ fontSize: 13, color: T.textMain, wordBreak: 'break-word', fontWeight: 500 }}>{v}</div>
                        </div>
                      ) : null)}
                      <div style={{ background: T.bgWhite, borderRadius: 12, padding: '10px 14px', border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
                        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>Account Status</div>
                        <div style={{ fontSize: 13, color: client.isactive === 'Y' ? T.green : T.red, fontWeight: 700 }}>
                          {client.isactive === 'Y' ? 'Active' : 'Suspended'}
                        </div>
                      </div>
                    </div>

                    {/* Quick Admin Actions Row */}
                    <div style={{ marginTop: 24, borderTop: `1px solid ${T.border}`, paddingTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onToggleActive(client.id) }} 
                        style={{ padding: '9px 18px', background: client.isactive === 'Y' ? T.redSoft : T.greenSoft, color: client.isactive === 'Y' ? T.red : T.green, border: `1px solid ${client.isactive === 'Y' ? T.red + '33' : T.green + '33'}`, borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                      >
                        {client.isactive === 'Y' ? 'Suspend Account' : 'Activate Account'}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onOpenExtendModal(client) }} 
                        style={{ padding: '9px 18px', background: T.primarySoft, color: T.primary, border: `1px solid ${T.primary}33`, borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                      >
                        Extend Subscription
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'modules' && (
                  !uniqueModules?.length
                    ? <p style={{ color: T.textMuted, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No subscription modules.</p>
                    : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                        {uniqueModules.map(m => {
                          const mc = getModuleColor(m.moduleName)
                          return (
                            <div key={m.moduleName} style={{ 
                              background: T.bgWhite, 
                              border: `1px solid ${T.border}`,
                              borderLeft: `4px solid ${mc.color}`,
                              borderRadius: 12, 
                              padding: '14px 16px', 
                              boxShadow: T.shadow,
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <span style={{ color: T.textMain, fontWeight: 700, fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>{m.moduleName.replace(/_/g, ' ')}</span>
                                <StatusBadge status={m.status} />
                              </div>
                              <div style={{ fontSize: 11, color: T.textMuted }}>Expires: {fmtDate(m.expiryDate)}</div>
                              <div style={{ fontSize: 11, color: T.textSub, marginTop: 4 }}>Auto-renew: {m.autoRenew ? 'Yes' : 'No'}</div>
                            </div>
                          )
                        })}
                      </div>
                )}

                {activeTab === 'payments' && (
                  <div>
                    {/* Add manual payment button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onOpenPaymentModal(client) }} 
                        style={{ padding: '8px 16px', background: `linear-gradient(135deg, ${T.green}, #0d9488)`, color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, boxShadow: `0 4px 12px ${T.green}33` }}
                      >
                        Record Manual Payment
                      </button>
                    </div>
                    <PaymentHistoryTable payments={client.paymentHistory} />
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportToCSV(clients) {
  const headers = ['Name', 'Legal Name', 'Owner', 'Email', 'Phone', 'Country', 'Sub Status', 'Expiry', 'Days Left', 'Active Modules', 'Total Paid (₹)', 'Payments', 'Registered']
  const rows = clients.map(c => [
    c.name || '', c.legalName || '', c.ownerName || '', c.email || '', c.phone || '', c.country || '',
    c.subscriptionStatus || '',
    c.subscriptionExpiryDate ? new Date(c.subscriptionExpiryDate).toLocaleDateString('en-IN') : '',
    c.daysLeft,
    (c.subscriptionModules || []).filter(m => m.status === 'ACTIVE').map(m => m.moduleName).join('; '),
    (c.totalPaidPaise / 100).toFixed(2), c.paymentCount,
    c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '',
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Login Gate ───────────────────────────────────────────────────────────────
function LoginGate({ onSuccess }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmedKey = key.trim()
    if (!trimmedKey) return

    if (trimmedKey !== EXPECTED_KEY) { setError('Incorrect secret key. Try again.'); return }

    setLoading(true); setError('')
    try {
      await axios.get(`${API_BASE}/api/v1/founder/dashboard`, {
        headers: { 'X-Founder-Key': trimmedKey }, timeout: 8000,
      })
      sessionStorage.setItem(STORAGE_KEY, trimmedKey)
      onSuccess(trimmedKey)
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) setError(`Backend rejected the key (HTTP ${status}). Please restart the backend.`)
      else if (!err.response) setError('Cannot reach backend — is the Spring Boot server running?')
      else setError(`Error ${status || ''}: ${err.response?.data?.message || err.message}`)
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #FFF7F0 0%, #FFFFFF 40%, #F0F4FF 100%)',
      fontFamily: 'Inter, sans-serif', position: 'relative',
    }}>
      <div style={{ position: 'fixed', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, #FF7A0012 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -80, left: -80, width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, #3B82F60A 0%, transparent 70%)', pointerEvents: 'none' }} />

      <form onSubmit={handleSubmit} style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 16px' }}>
        <div style={{
          background: T.bgWhite, borderRadius: 28,
          border: `1px solid ${T.border}`,
          padding: '48px 44px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, margin: '0 auto 18px',
              background: `linear-gradient(135deg, ${T.primary}, #FF4D00)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 8px 24px ${T.primary}44`,
              color: '#fff', fontWeight: 900, fontSize: 26, fontFamily: 'Outfit, sans-serif'
            }}>C</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: T.textMain, margin: 0, fontFamily: 'Outfit, sans-serif' }}>Founder Dashboard</h1>
            <p style={{ color: T.textMuted, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
              Private access · Enter your secret key
            </p>
          </div>

          {/* Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.textSub, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Secret Key
            </label>
            <input
              id="founder-key-input"
              ref={inputRef}
              type="password"
              value={key}
              onChange={e => { setKey(e.target.value); setError('') }}
              placeholder="Enter your founder secret key"
              style={{
                width: '100%', background: T.bg,
                border: `1.5px solid ${error ? T.red : T.border}`,
                borderRadius: 14, padding: '14px 18px', fontSize: 14,
                color: T.textMain, fontFamily: 'Inter, sans-serif', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = T.primary; e.target.style.boxShadow = `0 0 0 4px ${T.primary}15` }}
              onBlur={e => { e.target.style.borderColor = error ? T.red : T.border; e.target.style.boxShadow = 'none' }}
            />
            {error && <p style={{ color: T.red, fontSize: 12, marginTop: 8, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ {error}</p>}
          </div>

          {/* Button */}
          <button
            id="founder-login-btn"
            type="submit"
            disabled={loading || !key.trim()}
            style={{
              width: '100%', padding: '15px', borderRadius: 14, border: 'none',
              background: loading || !key.trim() ? T.bgHover : `linear-gradient(135deg, ${T.primary}, #FF4D00)`,
              color: loading || !key.trim() ? T.textMuted : '#fff',
              fontSize: 15, fontWeight: 700, cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'Outfit, sans-serif', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: loading || !key.trim() ? 'none' : `0 6px 20px ${T.primary}44`,
            }}
            onMouseEnter={e => { if (!loading && key.trim()) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {loading
              ? <><span style={{ width: 16, height: 16, border: `2px solid rgba(255,255,255,0.4)`, borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Verifying…</>
              : 'Enter Dashboard'
            }
          </button>

          <p style={{ textAlign: 'center', color: T.textMuted, fontSize: 11, marginTop: 24, marginBottom: 0 }}>
            Cafe QR · Private & Confidential
          </p>
        </div>
      </form>
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
function Dashboard({ founderKey }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filtering & Search
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [posTypeFilter, setPosTypeFilter] = useState('ALL')
  const [countryFilter, setCountryFilter] = useState('ALL')
  const [activeFilter, setActiveFilter] = useState('ALL') // 'ALL' | 'ACTIVE' | 'SUSPENDED'

  // Sorting
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  
  // Views
  const [viewMode, setViewMode] = useState('table') // 'table' | 'graph' | 'chart'

  // Modals for admin actions
  const [extendModalClient, setExtendModalClient] = useState(null)
  const [paymentModalClient, setPaymentModalClient] = useState(null)
  const [extendDays, setExtendDays] = useState(30)
  const [extendLoading, setExtendLoading] = useState(false)

  const [payAmount, setPayAmount] = useState('')
  const [payId, setPayId] = useState('')
  const [payOrderId, setPayOrderId] = useState('')
  const [payLoading, setPayLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const res = await axios.get(`${API_BASE}/api/v1/founder/dashboard`, { headers: { 'X-Founder-Key': founderKey } })
      setData(res.data?.data)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load data')
    } finally { setLoading(false) }
  }, [founderKey])

  useEffect(() => { fetchData() }, [fetchData])

  // Extract unique POS Types and Countries dynamically for filters
  const posTypes = useMemo(() => {
    if (!data?.clients) return []
    const set = new Set()
    data.clients.forEach(c => { if (c.posType) set.add(c.posType) })
    return Array.from(set).sort()
  }, [data])

  const countries = useMemo(() => {
    if (!data?.clients) return []
    const set = new Set()
    data.clients.forEach(c => { if (c.country) set.add(c.country) })
    return Array.from(set).sort()
  }, [data])

  // Compile monthly revenues for chart
  const monthlyRevenue = useMemo(() => {
    if (!data?.clients) return []
    const payments = []
    data.clients.forEach(c => {
      if (c.paymentHistory) {
        c.paymentHistory.forEach(p => { payments.push(p) })
      }
    })

    payments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    const groups = {}
    payments.forEach(p => {
      if (!p.createdAt) return
      const date = new Date(p.createdAt)
      const monthKey = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      groups[monthKey] = (groups[monthKey] || 0) + (p.amount || 0)
    })

    return Object.entries(groups).map(([month, paise]) => ({
      month,
      paise,
      revenue: paise / 100
    }))
  }, [data])

  const maxMonthAmt = useMemo(() => {
    return monthlyRevenue.length ? Math.max(...monthlyRevenue.map(m => m.revenue), 1) : 1
  }, [monthlyRevenue])

  // Compile Status Stats for status distribution chart
  const statusStats = useMemo(() => {
    const stats = { ACTIVE: 0, TRIAL: 0, EXPIRED: 0, UNPAID: 0 }
    if (!data?.clients) return stats
    data.clients.forEach(c => {
      const s = (c.subscriptionStatus || '').toUpperCase()
      if (stats[s] !== undefined) stats[s]++
      else stats.UNPAID++
    })
    return stats
  }, [data])

  const maxStatusCount = useMemo(() => {
    return Math.max(statusStats.ACTIVE, statusStats.TRIAL, statusStats.EXPIRED, statusStats.UNPAID, 1)
  }, [statusStats])

  const statusChartData = useMemo(() => {
    return [
      { label: 'Active', count: statusStats.ACTIVE, color: T.green, bg: 'linear-gradient(180deg, #10b981, #059669)' },
      { label: 'Trial', count: statusStats.TRIAL, color: T.orange, bg: 'linear-gradient(180deg, #FF7A00, #ff4d00)' },
      { label: 'Expired', count: statusStats.EXPIRED, color: T.red, bg: 'linear-gradient(180deg, #ef4444, #dc2626)' },
      { label: 'Unpaid', count: statusStats.UNPAID, color: T.textMuted, bg: 'linear-gradient(180deg, #94a3b8, #64748b)' },
    ]
  }, [statusStats])

  // Client filtering & sorting logic
  const filteredClients = useMemo(() => {
    if (!data?.clients) return []
    let list = [...data.clients]
    
    // Status filters
    if (statusFilter !== 'ALL') {
      list = list.filter(c => (c.subscriptionStatus || '').toUpperCase() === statusFilter)
    }

    // POS Type Filter
    if (posTypeFilter !== 'ALL') {
      list = list.filter(c => c.posType === posTypeFilter)
    }

    // Country Filter
    if (countryFilter !== 'ALL') {
      list = list.filter(c => c.country === countryFilter)
    }

    // Account status filter
    if (activeFilter !== 'ALL') {
      const wantActive = activeFilter === 'ACTIVE'
      list = list.filter(c => (c.isactive === 'Y') === wantActive)
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) ||
        (c.ownerName || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      )
    }

    list.sort((a, b) => {
      let va, vb
      if (sortBy === 'name')    { va = a.name || '';              vb = b.name || '' }
      if (sortBy === 'status')  { va = a.subscriptionStatus || ''; vb = b.subscriptionStatus || '' }
      if (sortBy === 'revenue') { va = a.totalPaidPaise;           vb = b.totalPaidPaise }
      if (sortBy === 'expiry')  { va = a.subscriptionExpiryDate || ''; vb = b.subscriptionExpiryDate || '' }
      if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
    return list
  }, [data, search, statusFilter, posTypeFilter, countryFilter, activeFilter, sortBy, sortDir])

  // Actions
  const handleToggleActive = async (clientId) => {
    if (!confirm('Are you sure you want to change the active status of this client?')) return
    try {
      await axios.post(`${API_BASE}/api/v1/founder/client/${clientId}/toggle-active`, {}, {
        headers: { 'X-Founder-Key': founderKey }
      })
      alert('Client status toggled successfully!')
      fetchData()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleExtendSubscription = async (e) => {
    e.preventDefault()
    if (!extendModalClient) return
    setExtendLoading(true)
    try {
      await axios.post(`${API_BASE}/api/v1/founder/client/${extendModalClient.id}/extend-subscription`, {
        daysToAdd: parseInt(extendDays)
      }, {
        headers: { 'X-Founder-Key': founderKey }
      })
      alert('Subscription extended successfully!')
      setExtendModalClient(null)
      fetchData()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.message || err.message))
    } finally {
      setExtendLoading(false)
    }
  }

  const handleRecordPayment = async (e) => {
    e.preventDefault()
    if (!paymentModalClient) return
    const amountFloat = parseFloat(payAmount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      alert('Please enter a valid amount')
      return
    }
    setPayLoading(true)
    try {
      await axios.post(`${API_BASE}/api/v1/founder/client/${paymentModalClient.id}/record-payment`, {
        amountPaise: Math.round(amountFloat * 100),
        paymentId: payId.trim() || `MANUAL_${Date.now()}`,
        orderId: payOrderId.trim() || `ORDER_${Date.now()}`
      }, {
        headers: { 'X-Founder-Key': founderKey }
      })
      alert('Manual payment recorded successfully!')
      setPaymentModalClient(null)
      setPayAmount('')
      setPayId('')
      setPayOrderId('')
      fetchData()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.message || err.message))
    } finally {
      setPayLoading(false)
    }
  }

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }) => (
    <span style={{ marginLeft: 4, color: sortBy === col ? T.primary : T.textMuted, fontSize: 11 }}>
      {sortBy !== col ? '↕' : sortDir === 'asc' ? '↑' : '↓'}
    </span>
  )

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: T.bg, color: T.textMain }}>

      {/* Header */}
      <header style={{
        background: T.bgWhite, borderBottom: `1px solid ${T.border}`,
        position: 'sticky', top: 0, zIndex: 100, padding: '0 32px',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: `linear-gradient(135deg, ${T.primary}, #FF4D00)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${T.primary}44`,
              color: '#fff', fontWeight: 900, fontSize: 16, fontFamily: 'Outfit, sans-serif'
            }}>C</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: T.textMain, fontFamily: 'Outfit, sans-serif' }}>Founder Dashboard</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>Cafe QR · Admin Control Room</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button id="refresh-btn" onClick={fetchData}
              style={{ background: T.bg, color: T.textSub, border: `1px solid ${T.border}`, borderRadius: 12, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: T.shadow }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary + '66'; e.currentTarget.style.color = T.primary }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSub }}>
              Refresh
            </button>
            {data && (
              <button id="export-csv-btn" onClick={() => exportToCSV(filteredClients)}
                style={{ background: `linear-gradient(135deg,${T.green},#0d9488)`, color: '#fff', border: 'none', borderRadius: 12, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 4px 14px ${T.green}44` }}>
                Export CSV
              </button>
            )}
            <button id="lock-btn"
              onClick={() => { sessionStorage.removeItem(STORAGE_KEY); window.location.reload() }}
              style={{ background: T.bg, color: T.textMuted, border: `1px solid ${T.border}`, borderRadius: 12, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: T.shadow }}>
              Lock
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '28px 32px' }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
            <div style={{ width: 44, height: 44, border: `3px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: T.textMuted, fontSize: 14 }}>Scanning Client Database…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ background: T.redSoft, border: `1px solid #FECACA`, borderRadius: 18, padding: 40, textAlign: 'center', boxShadow: T.shadow }}>
            <span style={{ fontSize: 40 }}>⚠️</span>
            <p style={{ color: '#DC2626', fontSize: 15, fontWeight: 700, marginTop: 16, fontFamily: 'Outfit, sans-serif' }}>Failed to load dashboard</p>
            <p style={{ color: T.red, fontSize: 13 }}>{error}</p>
            <button onClick={fetchData} style={{ marginTop: 16, background: T.red, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 12px ${T.red}44` }}>Try Again</button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 24 }}>
              <StatCard label="Total Clients" value={data.stats.totalClients}                  sub="All registered"  accent={T.blue}   onClick={() => setStatusFilter('ALL')} />
              <StatCard label="Active"         value={data.stats.activeClients}                 sub="Paid & valid"    accent={T.green}  onClick={() => setStatusFilter('ACTIVE')} />
              <StatCard label="Trial"          value={data.stats.trialClients}                  sub="Free trial"      accent={T.orange} onClick={() => setStatusFilter('TRIAL')} />
              <StatCard label="Expired"        value={data.stats.expiredClients}                sub="Need renewal"    accent={T.red}    onClick={() => setStatusFilter('EXPIRED')} />
              <StatCard label="Unpaid"         value={data.stats.unpaidClients}                 sub="Never paid"      accent="#94A3B8"  onClick={() => setStatusFilter('UNPAID')} />
              <StatCard label="Total Revenue"  value={fmtRupees(data.stats.totalRevenuePaise)}  sub="All time"        accent={T.green}  />
            </div>

            {/* View Selection Tabs */}
            <div className="founder-tabs">
              <button className={`founder-tab ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
                Clients Table
              </button>
              <button className={`founder-tab ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}>
                Revenue Graph
              </button>
              <button className={`founder-tab ${viewMode === 'chart' ? 'active' : ''}`} onClick={() => setViewMode('chart')}>
                Status Chart
              </button>
            </div>

            {/* View 1: Clients List Grid & Table */}
            {viewMode === 'table' && (
              <>
                {/* Advanced Multi-filters Bar (One Line Flex Layout with NiceSelect Dropdowns) */}
                <div style={{
                  background: T.bgWhite, border: `1px solid ${T.border}`,
                  borderRadius: 16, padding: '12px 18px', marginBottom: 18,
                  display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
                  boxShadow: T.shadow,
                }}>
                  {/* Search Input */}
                  <input
                    id="search-clients"
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by business, owner, email..."
                    style={{
                      flex: '1 1 240px', minWidth: 160, background: T.bg,
                      border: `1.5px solid ${T.border}`, color: T.textMain,
                      borderRadius: 10, padding: '9px 14px', fontSize: 13,
                      fontFamily: 'inherit', outline: 'none', transition: 'all 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = T.primary; e.target.style.boxShadow = `0 0 0 3px ${T.primary}12` }}
                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none' }}
                  />

                  {/* Subscription Status Dropdown */}
                  <div style={{ width: 180 }}>
                    <NiceSelect 
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: 'ALL', label: 'All Subscriptions' },
                        { value: 'ACTIVE', label: 'Active Status' },
                        { value: 'TRIAL', label: 'Trial Status' },
                        { value: 'EXPIRED', label: 'Expired Status' },
                        { value: 'UNPAID', label: 'Unpaid Status' }
                      ]}
                    />
                  </div>

                  {/* Country Dropdown */}
                  <div style={{ width: 150 }}>
                    <NiceSelect 
                      value={countryFilter}
                      onChange={setCountryFilter}
                      options={[
                        { value: 'ALL', label: 'All Countries' },
                        ...countries.map(c => ({ value: c, label: c }))
                      ]}
                    />
                  </div>

                  {/* POS Type Dropdown */}
                  <div style={{ width: 150 }}>
                    <NiceSelect 
                      value={posTypeFilter}
                      onChange={setPosTypeFilter}
                      options={[
                        { value: 'ALL', label: 'All POS Types' },
                        ...posTypes.map(t => ({ value: t, label: t }))
                      ]}
                    />
                  </div>

                  {/* Account Status Dropdown */}
                  <div style={{ width: 160 }}>
                    <NiceSelect 
                      value={activeFilter}
                      onChange={setActiveFilter}
                      options={[
                        { value: 'ALL', label: 'All Accounts' },
                        { value: 'ACTIVE', label: 'Active Only' },
                        { value: 'SUSPENDED', label: 'Suspended Only' }
                      ]}
                    />
                  </div>

                  <div style={{ marginLeft: 'auto', color: T.textMuted, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Showing {filteredClients.length} of {data.clients.length}
                  </div>
                </div>

                {/* Clients Table */}
                <div className="founder-tbl-wrap" style={{ boxShadow: T.shadowLg }}>
                  <table className="founder-tbl">
                    <thead>
                      <tr>
                        {[['Client','name'],['Owner',null],['Subscription','status'],['Modules',null],['Revenue','revenue'],['',null]].map(([label,key],i) => (
                          <th key={label+i} onClick={key ? () => toggleSort(key) : undefined}
                            style={{ textAlign: i === 4 ? 'right' : 'left', cursor: key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            {label}{key && <SortIcon col={key} />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center', color: T.textMuted }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                            <div style={{ fontWeight: 650, fontSize: 14 }}>No clients match your filters</div>
                          </td>
                        </tr>
                      ) : filteredClients.map((client, i) => (
                        <ClientRow 
                          key={client.id} 
                          client={client} 
                          index={i} 
                          onToggleActive={handleToggleActive}
                          onOpenExtendModal={setExtendModalClient}
                          onOpenPaymentModal={setPaymentModalClient}
                        />
                      ))}
                    </tbody>
                  </table>
                  {filteredClients.length > 0 && (
                    <div style={{ padding: '12px 20px', background: T.bg, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.textMuted }}>
                      <span>Showing <b style={{ color: T.textSub }}>{filteredClients.length}</b> client{filteredClients.length !== 1 ? 's' : ''}</span>
                      <span>Click any row to expand details</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* View 2: Graph View (Revenue Monthly Bar Chart) */}
            {viewMode === 'graph' && (
              <div className="founder-chart-card" style={{ boxShadow: T.shadowLg }}>
                <div className="founder-chart-header">
                  <h4>Monthly Revenue Growth</h4>
                  <span className="founder-chart-sub">Visual monthly breakdown of collected subscription revenues</span>
                </div>
                <div className="founder-chart-container">
                  {monthlyRevenue.length === 0 ? (
                    <div className="founder-chart-empty">No payment transactions recorded to build charts.</div>
                  ) : (
                    <>
                      {/* Grid Lines */}
                      <div className="founder-chart-grid-lines">
                        <div className="founder-grid-line"><span className="founder-grid-line-label">₹{maxMonthAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                        <div className="founder-grid-line"><span className="founder-grid-line-label">₹{(maxMonthAmt * 0.75).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                        <div className="founder-grid-line"><span className="founder-grid-line-label">₹{(maxMonthAmt * 0.50).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                        <div className="founder-grid-line"><span className="founder-grid-line-label">₹{(maxMonthAmt * 0.25).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                        <div className="founder-grid-line zero"><span className="founder-grid-line-label">₹0</span></div>
                      </div>

                      {/* Bars */}
                      <div className="founder-hourly-chart">
                        {monthlyRevenue.map((m, i) => {
                          const pct = (m.revenue / maxMonthAmt) * 100;
                          return (
                            <div key={i} className="founder-hour-col">
                              <div className="founder-hour-bar-area">
                                <div className="founder-hour-bar" style={{ height: `${pct.toFixed(0)}%` }}>
                                  <span className="founder-hour-tip">
                                    <span className="founder-tip-amt">₹{m.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                  </span>
                                </div>
                              </div>
                              <div className="founder-hour-label">{m.month}</div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* View 3: Chart View (Subscription Status Breakdown) */}
            {viewMode === 'chart' && (
              <div className="founder-chart-card" style={{ boxShadow: T.shadowLg }}>
                <div className="founder-chart-header">
                  <h4>Subscription Status Distribution</h4>
                  <span className="founder-chart-sub">Breakdown of client bases by their current subscription state</span>
                </div>
                <div className="founder-chart-container">
                  {/* Grid Lines */}
                  <div className="founder-chart-grid-lines">
                    <div className="founder-grid-line"><span className="founder-grid-line-label">{maxStatusCount}</span></div>
                    <div className="founder-grid-line"><span className="founder-grid-line-label">{Math.round(maxStatusCount * 0.75)}</span></div>
                    <div className="founder-grid-line"><span className="founder-grid-line-label">{Math.round(maxStatusCount * 0.50)}</span></div>
                    <div className="founder-grid-line"><span className="founder-grid-line-label">{Math.round(maxStatusCount * 0.25)}</span></div>
                    <div className="founder-grid-line zero"><span className="founder-grid-line-label">0</span></div>
                  </div>

                  {/* Bars */}
                  <div className="founder-hourly-chart">
                    {statusChartData.map((s, i) => {
                      const pct = (s.count / maxStatusCount) * 100;
                      return (
                        <div key={i} className="founder-hour-col" style={{ width: 100 }}>
                          <div className="founder-hour-bar-area">
                            <div className="founder-hour-bar" style={{ height: `${pct.toFixed(0)}%`, background: s.bg, width: 36 }}>
                              <span className="founder-hour-tip" style={{ background: s.color || T.primary }}>
                                <span className="founder-tip-amt">{s.count} client{s.count !== 1 ? 's' : ''}</span>
                              </span>
                            </div>
                          </div>
                          <div className="founder-hour-label">{s.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Modal: Extend Subscription */}
            {extendModalClient && (
              <div className="founder-modal-overlay" onClick={() => setExtendModalClient(null)}>
                <div className="founder-modal" onClick={e => e.stopPropagation()}>
                  <h3>Extend Subscription</h3>
                  <p>Extend subscription for <strong>{extendModalClient.name}</strong></p>
                  <form onSubmit={handleExtendSubscription}>
                    <label>Days to Add</label>
                    <select 
                      value={extendDays} 
                      onChange={e => setExtendDays(e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${T.border}`, marginBottom: 20, fontSize: 13, background: '#fff', outline: 'none' }}
                    >
                      <option value={7}>7 Days (1 Week)</option>
                      <option value={15}>15 Days</option>
                      <option value={30}>30 Days (1 Month)</option>
                      <option value={90}>90 Days (3 Months)</option>
                      <option value={180}>180 Days (6 Months)</option>
                      <option value={365}>365 Days (1 Year)</option>
                    </select>
                    <div className="founder-modal-actions">
                      <button type="button" onClick={() => setExtendModalClient(null)} className="founder-modal-btn cancel">Cancel</button>
                      <button type="submit" disabled={extendLoading} className="founder-modal-btn confirm">
                        {extendLoading ? 'Saving...' : 'Extend'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal: Record Manual Payment */}
            {paymentModalClient && (
              <div className="founder-modal-overlay" onClick={() => setPaymentModalClient(null)}>
                <div className="founder-modal" onClick={e => e.stopPropagation()}>
                  <h3>Record Manual Payment</h3>
                  <p>Record manual offline payment for <strong>{paymentModalClient.name}</strong></p>
                  <form onSubmit={handleRecordPayment}>
                    <label>Amount (in ₹)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      placeholder="e.g. 5000"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${T.border}`, marginBottom: 12 }}
                    />
                    
                    <label>Payment reference ID</label>
                    <input 
                      type="text" 
                      placeholder="e.g. TXN_BANK_12345"
                      value={payId}
                      onChange={e => setPayId(e.target.value)}
                      style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${T.border}`, marginBottom: 12 }}
                    />

                    <label>Order Reference ID</label>
                    <input 
                      type="text" 
                      placeholder="e.g. ORD_MANUAL_99"
                      value={payOrderId}
                      onChange={e => setPayOrderId(e.target.value)}
                      style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${T.border}`, marginBottom: 20 }}
                    />

                    <div className="founder-modal-actions">
                      <button type="button" onClick={() => setPaymentModalClient(null)} className="founder-modal-btn cancel">Cancel</button>
                      <button type="submit" disabled={payLoading} className="founder-modal-btn confirm">
                        {payLoading ? 'Saving...' : 'Record'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '20px', color: T.textMuted, fontSize: 11, borderTop: `1px solid ${T.border}`, marginTop: 24, background: T.bgWhite }}>
        Cafe QR · Founder Dashboard · Private & Confidential
      </footer>
    </div>
  )
}

// ─── Page Entry ───────────────────────────────────────────────────────────────
export default function FounderDashboardPage() {
  const [founderKey, setFounderKey] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) setFounderKey(stored)
    setHydrated(true)
  }, [])

  if (!hydrated) return null

  return (
    <>
      <Head>
        <title>Founder Dashboard | Cafe QR</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F8F9FC !important; }
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #F1F5F9; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: #FF7A0066; }

        /* Custom System Table Styles */
        .founder-tbl-wrap {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          overflow: auto;
          box-shadow: 0 1px 3px rgba(0,0,0,.02);
        }
        .founder-tbl {
          width: 100%;
          border-collapse: collapse;
          min-width: 800px;
        }
        .founder-tbl th {
          background: #f8fafc;
          padding: 10px 18px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: .06em;
          border-bottom: 2px solid #FF7A00 !important;
          font-family: 'Outfit', sans-serif;
        }
        .founder-tbl td {
          padding: 10px 18px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
          color: #475569;
          vertical-align: middle;
          white-space: nowrap;
        }
        .founder-tbl tbody tr {
          cursor: pointer;
          transition: background .15s;
        }
        .founder-tbl tbody tr:hover td {
          background: #FFFBF5 !important;
        }
        .founder-tbl tbody tr.expanded-tr td {
          background: #FFF3E8 !important;
        }
        .founder-tbl tr:last-child td {
          border-bottom: none;
        }

        /* View Mode Segmented Tab Styles */
        .founder-tabs {
          display: flex;
          gap: 6px;
          margin-bottom: 20px;
          overflow-x: auto;
          padding: 8px 4px;
        }
        .founder-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: .2s;
          white-space: nowrap;
          font-family: 'Outfit', sans-serif;
          box-shadow: 0 1px 3px rgba(0,0,0,.02);
        }
        .founder-tab:hover {
          border-color: #FF7A00;
          color: #FF7A00;
          transform: translateY(-1px);
        }
        .founder-tab.active {
          background: #FF7A00;
          color: #fff;
          border-color: #FF7A00;
          box-shadow: 0 4px 12px rgba(255, 122, 0, .25);
        }

        /* Clickable Stat Cards */
        .stat-card-clickable:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          border-color: #FF7A0044 !important;
        }

        /* Chart Styling (mimicking hourly reports chart) */
        .founder-chart-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.02);
        }
        .founder-chart-header {
          margin-bottom: 20px;
          border-bottom: 1.5px solid #f1f5f9;
          padding-bottom: 12px;
        }
        .founder-chart-header h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          font-family: 'Outfit', sans-serif;
        }
        .founder-chart-sub {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
          margin-top: 2px;
          display: block;
        }
        .founder-chart-container {
          min-height: 210px;
          position: relative;
          z-index: 1;
          padding-top: 30px;
          padding-left: 60px;
          padding-bottom: 10px;
        }
        .founder-chart-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 150px;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
        }
        .founder-chart-grid-lines {
          position: absolute;
          inset: 0;
          left: 60px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          pointer-events: none;
          z-index: 1;
        }
        .founder-grid-line {
          border-top: 1px dashed #f1f5f9;
          position: relative;
          width: 100%;
          height: 0;
        }
        .founder-grid-line.zero {
          border-top: 1px solid #e2e8f0;
        }
        .founder-grid-line-label {
          position: absolute;
          left: -70px;
          bottom: -6px;
          width: 60px;
          text-align: right;
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          font-family: monospace;
        }
        .founder-hourly-chart {
          display: flex;
          gap: 24px;
          justify-content: flex-start;
          align-items: flex-end;
          min-height: 180px;
          overflow-x: auto;
          position: relative;
          z-index: 2;
          padding-bottom: 10px;
          -webkit-overflow-scrolling: touch;
        }
        .founder-hour-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 70px;
          flex-shrink: 0;
        }
        .founder-hour-bar-area {
          width: 100%;
          height: 130px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          position: relative;
        }
        .founder-hour-bar {
          width: 28px;
          background: linear-gradient(180deg, #FF7A00, #ffba7a);
          border-radius: 6px 6px 0 0;
          position: relative;
          transition: all 0.3s ease;
          min-height: 4px;
          box-shadow: 0 4px 10px rgba(255, 122, 0, 0.15);
          cursor: pointer;
        }
        .founder-hour-bar:hover {
          background: linear-gradient(180deg, #ff4d00, #FF7A00);
          transform: scaleX(1.1);
          box-shadow: 0 6px 15px rgba(255, 77, 0, 0.3);
        }
        .founder-hour-tip {
          position: absolute;
          bottom: 105%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          background: #FF7A00;
          color: white;
          padding: 6px 10px;
          border-radius: 8px;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s ease;
          box-shadow: 0 6px 12px rgba(255, 122, 0, 0.2);
          z-index: 10;
          white-space: nowrap;
        }
        .founder-hour-tip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid #FF7A00;
        }
        .founder-hour-bar:hover .founder-hour-tip {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .founder-tip-amt {
          font-size: 11px;
          font-weight: 800;
          font-family: 'Outfit', sans-serif;
        }
        .founder-hour-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #475569;
          margin-top: 10px;
          font-family: 'Outfit', sans-serif;
        }

        /* Modals */
        .founder-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15,23,42,0.3);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 16px;
        }
        .founder-modal {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 24px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          animation: fadeSlideIn 0.2s ease-out;
        }
        .founder-modal h3 {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 6px;
          font-family: 'Outfit', sans-serif;
        }
        .founder-modal p {
          font-size: 13px;
          color: #64748b;
          margin-bottom: 20px;
        }
        .founder-modal label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          display: block;
          margin-bottom: 6px;
          letter-spacing: 0.5px;
        }
        .founder-modal input, .founder-modal select {
          outline: none;
          font-family: inherit;
        }
        .founder-modal input:focus, .founder-modal select:focus {
          border-color: #FF7A00 !important;
          box-shadow: 0 0 0 3px #FF7A0022;
        }
        .founder-modal-actions {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }
        .founder-modal-btn {
          flex: 1;
          padding: 12px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          font-family: 'Outfit', sans-serif;
        }
        .founder-modal-btn.cancel {
          background: #f1f5f9;
          color: #475569;
        }
        .founder-modal-btn.cancel:hover {
          background: #e2e8f0;
        }
        .founder-modal-btn.confirm {
          background: #FF7A00;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(255,122,0,0.2);
        }
        .founder-modal-btn.confirm:hover {
          background: #ff4d00;
        }
      `}</style>

      {founderKey ? <Dashboard founderKey={founderKey} /> : <LoginGate onSuccess={k => setFounderKey(k)} />}
    </>
  )
}
