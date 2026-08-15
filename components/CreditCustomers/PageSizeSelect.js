import React, { useState, useRef, useEffect } from 'react';
import { FaChevronDown, FaCheck } from 'react-icons/fa';

export default function PageSizeSelect({
  value,
  options = [10, 25, 50, 100],
  onChange,
  label = 'Show per page',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="pg-size-select-wrap" ref={containerRef}>
      {label && <span className="pg-size-label">{label}:</span>}
      <div className="pg-size-dropdown">
        <button
          type="button"
          className={`pg-size-trigger ${open ? 'active' : ''}`}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span>{value}</span>
          <FaChevronDown className={`pg-size-chevron ${open ? 'open' : ''}`} />
        </button>

        {open && (
          <div className="pg-size-menu">
            {options.map((opt) => (
              <div
                key={opt}
                className={`pg-size-option ${opt === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <span>{opt}</span>
                {opt === value && <FaCheck className="pg-size-check" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
