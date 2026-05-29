/**
 * OrderTypeSelectorModal.js
 * Minimal full-screen order type picker.
 * Order types as a clean horizontal tab bar.
 * Tables as compact color-coded cubes below.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  FaChair, FaUtensils, FaShoppingBag, FaTruck, FaHistory, FaExpand, FaCompress,
} from 'react-icons/fa';

/* ─── order type definitions ─────────────────────────────────────── */
function buildOrderTypes(config) {
  const types = [];
  if (config?.tableManagementEnabled) {
    types.push({ key: 'TABLE',    icon: <FaChair />,     label: 'Dine in',     accent: '#f97316' });
  } else {
    types.push({ key: 'DINE_IN',   icon: <FaUtensils />,  label: 'Dine in',     accent: '#6366f1' });
  }
  types.push({ key: 'TAKEAWAY',  icon: <FaShoppingBag />, label: 'Parcel', accent: '#10b981' });
  types.push({ key: 'DELIVERY',  icon: <FaTruck />,     label: 'Delivery',  accent: '#3b82f6' });
  return types;
}

/* ─── table status color map ─────────────────────────────────────── */
const STATUS_CUBE = {
  AVAILABLE:   { bg: '#22c55e', label: 'Available' },
  OCCUPIED:    { bg: '#ef4444', label: 'Occupied' },
  RESERVED:    { bg: '#3b82f6', label: 'Reserved' },
  MAINTENANCE: { bg: '#94a3b8', label: 'On Hold' },
  BILLED:      { bg: '#eab308', label: 'Billed' },
  CLEANING:    { bg: '#f97316', label: 'Cleaning' },
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

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Config loads async — default to TABLE tab once tableManagementEnabled resolves
  useEffect(() => {
    if (config?.tableManagementEnabled && !activeType) {
      setActiveType('TABLE');
    }
  }, [config?.tableManagementEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setIsFullscreen(!!document.fullscreenElement);
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const orderTypes = useMemo(() => buildOrderTypes(config), [config]);

  const isTableConfigOn = Boolean(config?.tableManagementEnabled);

  /* group tables by floor — must be declared before any early return */
  const floors = useMemo(() => {
    const all = [...new Set(tables.map(t => t.floor).filter(Boolean))];
    return all;
  }, [tables]);

  /* filter tables by floor */
  const filteredTables = useMemo(() => {
    if (floorFilter === 'ALL') return tables;
    return tables.filter(t => t.floor === floorFilter);
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
            <button style={S.fsBtn} onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Go Fullscreen"}>
              {isFullscreen ? <FaCompress style={{ fontSize: 12 }} /> : <FaExpand style={{ fontSize: 12 }} />}
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
            {onHistoryClick && (
              <button style={S.salesHistBtn} onClick={onHistoryClick}>
                <FaHistory style={{ fontSize: 12 }} />
                Sales History
              </button>
            )}
            <button style={S.closeBtn} onClick={onClose}>
              ✕ Close
            </button>
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
          <button style={S.fsBtn} onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Go Fullscreen"}>
            {isFullscreen ? <FaCompress style={{ fontSize: 12 }} /> : <FaExpand style={{ fontSize: 12 }} />}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </button>
          {onHistoryClick && (
            <button style={S.salesHistBtn} onClick={onHistoryClick}>
              <FaHistory style={{ fontSize: 12 }} />
              Sales History
            </button>
          )}
          <button style={S.closeBtn} onClick={onClose}>
            ✕ Close
          </button>
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
                  <span style={{ ...S.legendDot, background: v.bg }} />
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
                      background: isHov ? cube.bg : `${cube.bg}cc`,
                      boxShadow: isHov ? `0 0 0 3px ${cube.bg}55, 0 4px 12px ${cube.bg}44` : 'none',
                      transform: isHov ? 'scale(1.12)' : 'scale(1)',
                      opacity: isAvail ? 1 : 0.5,
                      cursor: isAvail ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => handleTableClick(table)}
                    onMouseEnter={() => isAvail && setHoveredTable(table.id)}
                    onMouseLeave={() => setHoveredTable(null)}
                  >
                    <span style={S.cubeNum}>{table.tableNumber}</span>
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
    position: 'fixed', inset: 0,
    background: '#f8fafc',
    zIndex: 1100,
    display: 'flex', flexDirection: 'column',
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
    padding: 32,
    background: '#f8fafc',
  },
  centerCard: {
    width: 160,
    height: 160,
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
    fontSize: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCardLabel: {
    fontSize: 15,
    fontWeight: 800,
    color: '#334155',
  },

  /* Header */
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 32px',
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
  title: { fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' },
  divider: { color: '#cbd5e1', fontSize: 16 },
  sub: { fontSize: 13, fontWeight: 600, color: '#64748b' },
  headerRight: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  fsBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 16px', borderRadius: 10,
    border: '1px solid #cbd5e1', background: 'white',
    color: '#475569', fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  salesHistBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 16px', borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: 'white', fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(249, 115, 22, 0.25)',
    transition: 'all 0.15s ease',
  },
  closeBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '8px 16px', borderRadius: 10,
    border: '1px solid #f97316', background: 'white',
    color: '#f97316', fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  /* Type tabs */
  typeTabs: {
    display: 'flex', gap: 0,
    padding: '0 32px',
    borderBottom: '1px solid #e2e8f0',
    background: 'white',
    flexShrink: 0,
    overflowX: 'auto',
  },
  typeTab: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '16px 24px',
    border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
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
    fontSize: 15, display: 'flex', alignItems: 'center',
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
    padding: '24px 32px',
    gap: 20,
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
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11, fontWeight: 600, color: '#64748b',
  },
  legendDot: {
    width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
  },

  /* Floor filter */
  floorRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  floorPill: (active) => ({
    padding: '5px 12px', borderRadius: 100,
    border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
    background: active ? '#0f172a' : 'white',
    color: active ? 'white' : '#64748b',
    fontSize: 11, fontWeight: 700,
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
    gap: 10, padding: '48px 0',
  },
};
