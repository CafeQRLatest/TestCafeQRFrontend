import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function NiceSelect({ value, onChange, options, placeholder = "Select...", disabled = false, autoFocus = false, maxHeight = 300, style = {}, className = "" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, direction: 'down' });
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  const current = options.find((o) => o.value === value);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Update position when opening or scrolling
  useEffect(() => {
    if (open && containerRef.current) {
      const updatePosition = () => {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const needsUp = spaceBelow < maxHeight && rect.top > spaceBelow;
        
        setCoords({
          top: needsUp ? rect.top : rect.bottom,
          left: rect.left,
          width: rect.width,
          direction: needsUp ? 'up' : 'down'
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [open, maxHeight]);

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => {
        const input = dropdownRef.current?.querySelector('input');
        if (input) input.focus();
      }, 50);
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && 
          dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dropdownContent = open && (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        zIndex: 99999,
        top: coords.direction === 'down' ? coords.top + 8 : 'auto',
        bottom: coords.direction === 'up' ? (window.innerHeight - coords.top) + 8 : 'auto',
        left: coords.left,
        width: coords.width,
        minWidth: 240,
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.02)",
        maxHeight: maxHeight,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: coords.direction === 'down' ? 'slideInDown 0.2s ease-out' : 'slideInUp 0.2s ease-out'
      }}
    >
      <div style={{ padding: '8px' }}>
        <input
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setSearch(e.target.value)}
          value={search}
          placeholder="Search..."
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #f1f5f9',
            background: '#f8fafc',
            outline: 'none',
            fontSize: 13,
            color: '#334155'
          }}
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filteredOptions.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>
            No matches
          </div>
        ) : filteredOptions.map((opt) => {
          const active = opt.value === value;
          return (
            <div
              key={opt.value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: active ? "#fff7ed" : "#fff",
                color: active ? "#FF7A00" : "#334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = '#fff';
              }}
            >
              <span>{opt.label}</span>
              {active && <span style={{ color: '#FF7A00' }}>✓</span>}
            </div>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes slideInDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  return (
    <div style={{ ...selectWrapper, ...style }} ref={containerRef} className={className}>
      <button
        autoFocus={autoFocus}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="nice-select-trigger"
        style={{
          ...selectInput,
          ...style,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
          borderColor: open ? '#FF7A00' : '#e2e8f0',
          boxShadow: open ? '0 0 0 4px rgba(255, 122, 0, 0.08), 0 4px 12px rgba(0,0,0,0.05)' : '0 1px 2px rgba(0,0,0,0.02)',
        }}
      >
        <span style={{ 
          fontSize: 14, 
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginRight: 20,
          color: '#1e293b'
        }}>
          {current?.label || placeholder}
        </span>
        <span style={{
          position: "absolute",
          right: 14,
          top: "50%",
          pointerEvents: "none",
          fontSize: 12,
          color: open ? '#FF7A00' : '#94a3b8',
          transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
          transition: 'all 0.3s ease'
        }}>▼</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}

const selectWrapper = {
  position: "relative",
  width: "100%",
};

const selectInput = {
  width: "100%",
  padding: "8px 14px",
  fontFamily: "'Inter', sans-serif",
  height: "40px",
  outline: "none",
  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
  border: "1px solid #e2e8f0",
  background: "#fff",
  borderRadius: "10px",
  color: "#334155",
};
