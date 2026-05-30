/**
 * OrderTypeSelectorModal.js
 * Minimal full-screen order type picker.
 * Order types as a clean horizontal tab bar.
 * Tables as compact color-coded cubes below.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  FaChair, FaUtensils, FaShoppingBag, FaTruck, FaHistory,
} from 'react-icons/fa';

/* ─── order type definitions ─────────────────────────────────────── */
function buildOrderTypes(config) {
  const types = [];
  if (config?.tableManagementEnabled) {
    types.push({ key: 'TABLE',    icon: <FaChair />,     label: 'Dine in',     accent: '#f97316' });
  } else {
    types.push({ key: 'DINE_IN',   icon: <FaUtensils />,  label: 'Dine in',     accent: '#6366f1' });
  }
  types.push({ key: 'TAKEAWAY',  icon: <FaShoppingBag />, label: 'Takeaway', accent: '#10b981' });
  if (config?.onlineDeliveryEnabled) {
    types.push({ key: 'DELIVERY',  icon: <FaTruck />,     label: 'Delivery',  accent: '#3b82f6' });
  }
  return types;
}

/* ─── table status color map ─────────────────────────────────────── */
const STATUS_CUBE = {
  AVAILABLE:   { bg: '#ffffff', fg: '#0f172a', border: '#cbd5e1', label: 'Available' },
  OCCUPIED:    { bg: '#ef4444', fg: '#ffffff', border: '#dc2626', label: 'Occupied' },
  BILLED:      { bg: '#10b981', fg: '#ffffff', border: '#059669', label: 'Billed' },
  RESERVED:    { bg: '#3b82f6', fg: '#ffffff', border: '#2563eb', label: 'Reserved' },
  CLEANING:    { bg: '#f97316', fg: '#ffffff', border: '#ea580c', label: 'Cleaning' },
  MAINTENANCE: { bg: '#64748b', fg: '#ffffff', border: '#475569', label: 'Hold' },
};
function cubeColor(status) {
  return STATUS_CUBE[String(status || 'AVAILABLE').toUpperCase()] || STATUS_CUBE.AVAILABLE;
}

/* ─── component ──────────────────────────────────────────────────── */
export default function OrderTypeSelectorModal({
  tables = [],
  config = null,
  onSelect,
  onHistoryClick,
  onPoHistoryClick,
  onClose,
}) {
  const [activeType, setActiveType] = useState(
    config?.tableManagementEnabled ? 'TABLE' : null
  );
  const [hoveredTable, setHoveredTable] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [floorFilter, setFloorFilter] = useState('ALL');

  // Config loads async — default to TABLE tab once tableManagementEnabled resolves
  useEffect(() => {
    if (config?.tableManagementEnabled && !activeType) {
      setActiveType('TABLE');
    }
  }, [config?.tableManagementEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderTypes = useMemo(() => buildOrderTypes(config), [config]);

  const isTableConfigOn = Boolean(config?.tableManagementEnabled);

  /* group tables by floor — must be declared before any early return */
  const floors = useMemo(() => {
    const all = [...new Set(tables.map(t => t.floor).filter(Boolean))];
    return all;
  }, [tables]);

  /* filter and sort tables by floor/number */
  const filteredTables = useMemo(() => {
    const list = floorFilter === 'ALL'
      ? [...tables]
      : tables.filter(t => t.floor === floorFilter);

    return list.sort((a, b) => {
      const numA = parseInt(String(a.tableNumber || '').replace(/\D/g, ''), 10);
      const numB = parseInt(String(b.tableNumber || '').replace(/\D/g, ''), 10);

      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      }
      return String(a.tableNumber || '').localeCompare(String(b.tableNumber || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [tables, floorFilter]);

  const showTablePicker = activeType === 'TABLE';

  if (!isTableConfigOn) {
    return (
      <div style={S.overlay}>
        {/* ── Header bar ── */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.titleIndicator} />
            <span style={S.title}>Sale Order</span>
            <span style={S.divider}>·</span>
            <span style={S.sub}>Select order type</span>
          </div>
          <div style={S.headerRight}>
            {onHistoryClick && (
              <button style={S.salesHistBtn} onClick={onHistoryClick}>
                Sales History
              </button>
            )}
          </div>
        </div>

        {/* Centered cards container */}
        <div style={S.centerContainer}>
          {orderTypes.map(type => {
            const isHov = hoveredCard === type.key;
            return (
              <button
                key={type.key}
                style={{
                  ...S.centerCard,
                  borderColor: isHov ? type.accent : '#e2e8f0',
                  transform: isHov ? 'translateY(-6px)' : 'translateY(0)',
                  boxShadow: isHov
                    ? `0 12px 20px -8px ${type.accent}44, 0 4px 12px rgba(0,0,0,0.05)`
                    : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                }}
                onClick={() => onSelect({ orderType: type.key, table: null })}
                onMouseEnter={() => setHoveredCard(type.key)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <span style={{ ...S.centerCardIcon, color: type.accent }}>{type.icon}</span>
                <span style={S.centerCardLabel}>{type.label}</span>
              </button>
            );
          })}
        </div>

        <style jsx global>{`
          @keyframes _ots_in {
            from { opacity:0; transform:translateY(16px) }
            to   { opacity:1; transform:translateY(0) }
          }
        `}</style>
      </div>
    );
  }

  const handleTypeClick = (type) => {
    if (type.key === 'TABLE') {
      setActiveType(type.key);
    } else {
      onSelect({ orderType: type.key, table: null });
    }
  };

  const handleTableClick = (table) => {
    const status = String(table.status || 'AVAILABLE').toUpperCase();
    if (status !== 'AVAILABLE') return; // only allow available
    onSelect({ orderType: 'TABLE', table });
  };

  return (
    <div style={S.overlay}>
      {/* ── Header bar ── */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.titleIndicator} />
          <span style={S.title}>Sale Order</span>
          <span style={S.divider}>·</span>
          <span style={S.sub}>Select order type</span>
        </div>
        <div style={S.headerRight}>
          {onHistoryClick && (
            <button style={S.salesHistBtn} onClick={onHistoryClick}>
              Sales History
            </button>
          )}
        </div>
      </div>

      {/* ── Order type tabs ── */}
      <div style={S.typeTabs}>
        {orderTypes.map(type => {
          const isActive = activeType === type.key;
          return (
            <button
              key={type.key}
              style={{
                ...S.typeTab,
                ...(isActive ? S.typeTabActive(type.accent) : {}),
              }}
              onClick={() => handleTypeClick(type)}
            >
              <span style={{
                ...S.typeTabIcon,
                color: isActive ? type.accent : '#94a3b8',
              }}>
                {type.icon}
              </span>
              <span style={{
                ...S.typeTabLabel,
                color: isActive ? type.accent : '#64748b',
                fontWeight: isActive ? 800 : 600,
              }}>
                {type.label}
              </span>
              {isActive && <span style={S.typeTabDot(type.accent)} />}
            </button>
          );
        })}
      </div>

      {/* ── Table picker (slides in when TABLE selected) ── */}
      {showTablePicker && (
        <div style={S.tablePicker}>

          {/* Legend + floor filter */}
          <div style={S.tableToolbar}>
            <div style={S.legend}>
              {Object.entries(STATUS_CUBE).map(([k, v]) => (
                <span key={k} style={S.legendItem}>
                  <span style={{
                    ...S.legendDot,
                    background: v.bg,
                    border: `1px solid ${v.border || 'transparent'}`,
                  }} />
                  {v.label}
                </span>
              ))}
            </div>
            {floors.length > 1 && (
              <div style={S.floorRow}>
                <button
                  style={S.floorPill(floorFilter === 'ALL')}
                  onClick={() => setFloorFilter('ALL')}
                >All</button>
                {floors.map(f => (
                  <button
                    key={f}
                    style={S.floorPill(floorFilter === f)}
                    onClick={() => setFloorFilter(f)}
                  >{f}</button>
                ))}
              </div>
            )}
          </div>

          {/* Table cubes */}
          {filteredTables.length === 0 ? (
            <div style={S.empty}>
              <FaChair style={{ fontSize: 28, color: '#cbd5e1' }} />
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>No tables found</span>
            </div>
          ) : (
            <div style={S.cubeGrid}>
              {filteredTables.map(table => {
                const status = String(table.status || 'AVAILABLE').toUpperCase();
                const cube = cubeColor(status);
                const isAvail = status === 'AVAILABLE';
                const isHov = hoveredTable === table.id && isAvail;
                return (
                  <button
                    key={table.id}
                    disabled={!isAvail}
                    title={`Table ${table.tableNumber} — ${cube.label}${table.floor ? ` · ${table.floor}` : ''}`}
                    style={{
                      ...S.cube,
                      background: isHov
                        ? (status === 'AVAILABLE' ? '#f8fafc' : cube.bg)
                        : cube.bg,
                      border: `1.5px solid ${isHov && status === 'AVAILABLE' ? '#0f172a' : (cube.border || 'transparent')}`,
                      boxShadow: isHov
                        ? (status === 'AVAILABLE'
                          ? '0 8px 20px rgba(15, 23, 42, 0.12), 0 4px 8px rgba(15, 23, 42, 0.04)'
                          : `0 0 0 3px ${cube.bg}55, 0 4px 12px ${cube.bg}44`)
                        : 'none',
                      transform: isHov ? 'scale(1.12)' : 'scale(1)',
                      opacity: 1,
                      cursor: isAvail ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => handleTableClick(table)}
                    onMouseEnter={() => isAvail && setHoveredTable(table.id)}
                    onMouseLeave={() => setHoveredTable(null)}
                  >
                    <span style={{
                      ...S.cubeNum,
                      color: cube.fg || 'white',
                      textShadow: status === 'AVAILABLE' ? 'none' : '0 1px 2px rgba(0,0,0,0.25)',
                    }}>{table.tableNumber}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}



      <style jsx global>{`
        @keyframes _ots_in {
          from { opacity:0; transform:translateY(16px) }
          to   { opacity:1; transform:translateY(0) }
        }
        @keyframes _ots_slide {
          from { opacity:0; transform:translateY(10px) }
          to   { opacity:1; transform:translateY(0) }
        }
      `}</style>
    </div>
  );
}

/* ─── styles ─────────────────────────────────────────────────────── */
const S = {
  overlay: {
    background: '#f8fafc',
    display: 'flex', flexDirection: 'column',
    position: 'relative',
    flex: 1,
    width: '100%',
    height: 'calc(100vh - 60px)',
    borderRadius: 0,
    border: 'none',
    borderLeft: '1px solid #e2e8f0',
    overflow: 'hidden',
    boxShadow: 'none',
    animation: '_ots_in 0.28s cubic-bezier(0.16,1,0.3,1)',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },

  /* Centered cards (if table config off) */
  centerContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: 20,
    background: '#f8fafc',
  },
  centerCard: {
    width: 150,
    height: 150,
    borderRadius: 20,
    border: '1px solid #e2e8f0',
    background: 'white',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'inherit',
    outline: 'none',
  },
  centerCardIcon: {
    fontSize: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCardLabel: {
    fontSize: 14,
    fontWeight: 800,
    color: '#334155',
  },

  /* Header */
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #e2e8f0',
    background: 'white',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  titleIndicator: {
    width: 4,
    height: 18,
    borderRadius: 2,
    background: 'linear-gradient(to bottom, #f97316, #ea580c)',
  },
  title: { fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' },
  divider: { color: '#cbd5e1', fontSize: 14 },
  sub: { fontSize: 12, fontWeight: 600, color: '#64748b' },
  headerRight: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  fsBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '6px 12px', borderRadius: 8,
    border: '1px solid #cbd5e1', background: 'white',
    color: '#475569', fontSize: 11, fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  salesHistBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '6px 12px', borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: 'white', fontSize: 11, fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(249, 115, 22, 0.25)',
    transition: 'all 0.15s ease',
  },
  closeBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 8,
    border: '1px solid #f97316', background: 'white',
    color: '#f97316', fontSize: 11, fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  /* Type tabs */
  typeTabs: {
    display: 'flex', gap: 0,
    padding: '0 20px',
    borderBottom: '1px solid #e2e8f0',
    background: 'white',
    flexShrink: 0,
    overflowX: 'auto',
  },
  typeTab: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 18px',
    border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#64748b', position: 'relative',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
    borderBottom: '2px solid transparent',
  },
  typeTabActive: (accent) => ({
    color: accent,
    borderBottom: `2px solid ${accent}`,
  }),
  typeTabIcon: {
    fontSize: 14, display: 'flex', alignItems: 'center',
    transition: 'color 0.15s',
  },
  typeTabLabel: {
    transition: 'color 0.15s, font-weight 0.15s',
  },
  typeTabDot: (accent) => ({
    width: 6, height: 6, borderRadius: '50%',
    background: accent, marginLeft: 2,
  }),

  /* Table picker */
  tablePicker: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '16px 20px',
    gap: 16,
    overflowY: 'auto',
    animation: '_ots_slide 0.22s ease',
  },
  tableToolbar: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 12,
  },

  /* Legend */
  legend: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600, color: '#64748b',
  },
  legendDot: {
    width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
  },

  /* Floor filter */
  floorRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  floorPill: (active) => ({
    padding: '4px 10px', borderRadius: 100,
    border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
    background: active ? '#0f172a' : 'white',
    color: active ? 'white' : '#64748b',
    fontSize: 10, fontWeight: 700,
    cursor: 'pointer',
  }),

  /* Cube grid */
  cubeGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
    alignContent: 'flex-start',
  },
  cube: {
    width: 56, height: 56, borderRadius: 12,
    border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
    flexShrink: 0,
  },
  cubeNum: {
    fontSize: 12, fontWeight: 800, color: 'white',
    textShadow: '0 1px 2px rgba(0,0,0,0.25)',
    letterSpacing: '-0.02em',
    maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap', textAlign: 'center',
  },

  /* Empty / footer */
  empty: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '36px 0',
  },
};
