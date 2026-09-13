import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaCalendarAlt, FaChevronLeft, FaChevronRight, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useAuth } from '../../../context/AuthContext';
import { getBusinessNow as getBizNow } from '../../../utils/timezoneUtils';

export default function PosDateTimePicker({
  value,
  onChange,
  themeColor = '#f97316',
  disabled = false,
  isLive = true,
  onResetLive
}) {
  const { timezone } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [inputValue, setInputValue] = useState('');
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, direction: 'down' });
  const [isMobile, setIsMobile] = useState(false);

  // Helper to get time in business timezone
  const getBusinessNow = () => getBizNow(timezone);

  const getLocalISO = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  const formatDate = (date) => {
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleString([], { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Live 1-second ticking clock when in live mode and dropdown is not open
  useEffect(() => {
    if (!isLive) return;

    const tick = () => {
      const now = getBusinessNow();
      setSelectedDate(now);
      setInputValue(formatDate(now));
      if (onChange) {
        onChange(getLocalISO(now), { isNow: true, liveTick: true });
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isLive, timezone]);

  // When value prop changes from outside (e.g., initial or manual edit)
  useEffect(() => {
    if (isLive) return;

    if (value && value.length > 5) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        if (viewDate.getMonth() !== d.getMonth() || viewDate.getFullYear() !== d.getFullYear()) {
          setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
        }
        setInputValue(formatDate(d));
      }
    }
  }, [value, isLive]);

  const handleSetNow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = getBusinessNow();
    setSelectedDate(now);
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setInputValue(formatDate(now));
    if (onResetLive) onResetLive();
    if (onChange) onChange(getLocalISO(now), { isNow: true });
    setIsOpen(false);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update position when opening or scrolling
  useEffect(() => {
    if (isOpen && wrapperRef.current) {
      const updatePosition = () => {
        const rect = wrapperRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = window.innerWidth <= 480 ? 440 : 280;
        const needsUp = spaceBelow < dropdownHeight && rect.top > spaceBelow;
        
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
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        wrapperRef.current && !wrapperRef.current.contains(event.target) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    const parsed = new Date(e.target.value);
    if (!isNaN(parsed.getTime())) {
      setSelectedDate(parsed);
      setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      if (onChange) onChange(getLocalISO(parsed), { isNow: false });
    }
  };

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handlePrevMonth = (e) => {
    e.preventDefault(); e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.preventDefault(); e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const selectDate = (day) => {
    const newDate = new Date(selectedDate);
    newDate.setFullYear(viewDate.getFullYear());
    newDate.setMonth(viewDate.getMonth());
    newDate.setDate(day);
    setSelectedDate(newDate);
    setInputValue(formatDate(newDate));
    if (onChange) onChange(getLocalISO(newDate), { isNow: false });
  };

  const adjustTime = (e, type, delta) => {
    e.preventDefault(); e.stopPropagation();
    const newDate = new Date(selectedDate);
    if (type === 'h') newDate.setHours(newDate.getHours() + delta);
    if (type === 'm') newDate.setMinutes(newDate.getMinutes() + delta);
    setSelectedDate(newDate);
    setInputValue(formatDate(newDate));
    if (onChange) onChange(getLocalISO(newDate), { isNow: false });
  };

  const toggleAMPM = (e) => {
    e.preventDefault(); e.stopPropagation();
    const newDate = new Date(selectedDate);
    const hour = newDate.getHours();
    if (hour >= 12) newDate.setHours(hour - 12);
    else newDate.setHours(hour + 12);
    setSelectedDate(newDate);
    setInputValue(formatDate(newDate));
    if (onChange) onChange(getLocalISO(newDate), { isNow: false });
  };

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const currentHour24 = selectedDate.getHours();
  const displayHour = currentHour24 % 12 || 12;
  const isPM = currentHour24 >= 12;
  const displayMin = String(selectedDate.getMinutes()).padStart(2, '0');

  const dropdownWidth = isMobile ? 280 : 360;
  const triggerCenter = coords.left + coords.width / 2;
  const boundedLeft = typeof window !== 'undefined'
    ? Math.max(8, Math.min(triggerCenter - dropdownWidth / 2, window.innerWidth - dropdownWidth - 8))
    : coords.left;

  const dropdownContent = isOpen && (
    <div ref={dropdownRef} className="pos-dt-dropdown-side" onClick={e => e.stopPropagation()} style={{
      position: 'fixed',
      zIndex: 99999,
      top: coords.direction === 'down' ? coords.top + 6 : 'auto',
      bottom: coords.direction === 'up' ? (window.innerHeight - coords.top) + 6 : 'auto',
      left: boundedLeft,
      width: dropdownWidth
    }}>
      <div className="pos-dt-calendar">
        <div className="cal-hdr">
          <button type="button" onClick={handlePrevMonth}><FaChevronLeft /></button>
          <span>{viewDate.toLocaleString([], { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={handleNextMonth}><FaChevronRight /></button>
        </div>
        <div className="cal-grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="day-name">{d}</div>
          ))}
          {blanks.map(b => <div key={`b-${b}`} className="day empty" />)}
          {days.map(d => {
            const isSelected = selectedDate.getDate() === d && 
                             selectedDate.getMonth() === viewDate.getMonth() && 
                             selectedDate.getFullYear() === viewDate.getFullYear();
            return (
              <div 
                key={d} 
                className={`day ${isSelected ? 'selected' : ''}`}
                onClick={() => selectDate(d)}
              >
                {d}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pos-dt-time-side">
        <div className="time-box-title">Time</div>
        
        <div className="time-stepper">
          <div className="step-col">
            <button type="button" className="step-btn" onClick={(e) => adjustTime(e, 'h', 1)}><FaChevronUp /></button>
            <div className="step-val">{String(displayHour).padStart(2, '0')}</div>
            <button type="button" className="step-btn" onClick={(e) => adjustTime(e, 'h', -1)}><FaChevronDown /></button>
          </div>
          <div className="step-sep">:</div>
          <div className="step-col">
            <button type="button" className="step-btn" onClick={(e) => adjustTime(e, 'm', 1)}><FaChevronUp /></button>
            <div className="step-val">{displayMin}</div>
            <button type="button" className="step-btn" onClick={(e) => adjustTime(e, 'm', -1)}><FaChevronDown /></button>
          </div>
        </div>

        <div className="ampm-toggle">
          <button type="button" className={`ampm-p ${!isPM ? 'on' : ''}`} onClick={(e) => toggleAMPM(e)}>AM</button>
          <button type="button" className={`ampm-p ${isPM ? 'on' : ''}`} onClick={(e) => toggleAMPM(e)}>PM</button>
        </div>

        <button type="button" className="now-btn" onClick={handleSetNow}>
          Set Now (Live)
        </button>
      </div>
    </div>
  );

  return (
    <div className="premium-dt-picker" ref={wrapperRef}>
      <div
        className={`dt-trigger ${isOpen && !disabled ? 'active' : ''} ${disabled ? 'disabled' : ''}`} 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        title={isLive ? 'Live ticking time (Click to set custom date)' : 'Custom date set (Click to change or reset to now)'}
      >
        <FaCalendarAlt className="dt-icon" />
        <input 
          className="dt-input" 
          value={inputValue} 
          onChange={handleInputChange} 
          onClick={(e) => { e.stopPropagation(); if(!disabled) setIsOpen(true); }}
          placeholder="Select date & time…"
          readOnly={!isOpen || disabled}
        />
        <FaChevronDown className={`dt-chevron ${isOpen ? 'up' : ''}`} />
      </div>

      {isOpen && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}

      <style jsx>{`
        .premium-dt-picker { position: relative; width: 100%; user-select: none; }
        .dt-trigger {
          background: #fff;
          border: 1.5px solid #e2e8f0;
          padding: 6px 12px;
          height: 34px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .dt-trigger:hover { 
          border-color: ${themeColor}; 
          background: #fcfdfe; 
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
        }
        .dt-trigger.active, .dt-trigger:focus-within { 
          border-color: ${themeColor}; 
          box-shadow: 0 0 0 3px ${themeColor}15; 
          background: #fff;
        }
        .dt-trigger.disabled { background: #f8fafc; border-color: #e2e8f0; cursor: not-allowed; opacity: 0.7; }
        .dt-trigger.disabled .dt-input { cursor: not-allowed; }
        .dt-icon { color: ${themeColor}; font-size: 13px; opacity: 0.8; flex-shrink: 0; }
        .dt-input { 
          border: none; 
          background: none; 
          outline: none; 
          font-size: 12px; 
          font-weight: 600; 
          color: #1e293b; 
          flex: 1; 
          padding: 0; 
          pointer-events: auto; 
          width: 100%;
          font-variant-numeric: tabular-nums;
          cursor: pointer;
        }
        .dt-input:focus { color: #0f172a; }
        .dt-chevron { font-size: 9px; color: #64748b; transition: 0.2s; cursor: pointer; flex-shrink: 0; }
        .dt-chevron.up { transform: rotate(180deg); }
      `}</style>

      <style jsx global>{`
        .pos-dt-dropdown-side {
          background: #fff;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
          z-index: 100000;
          display: flex;
          overflow: hidden;
          animation: popIn 0.15s ease-out;
        }
        @keyframes popIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .pos-dt-calendar { padding: 14px; flex: 1; border-right: 1px solid #f1f5f9; }
        .cal-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .cal-hdr span { font-weight: 700; font-size: 12px; color: #1e293b; }
        .cal-hdr button { border: none; background: #f1f5f9; color: #334155; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; flex-shrink: 0; }
        .cal-hdr button:hover { background: ${themeColor}15; color: ${themeColor}; }

        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .day-name { font-size: 8.5px; font-weight: 800; color: #64748b; text-align: center; padding: 4px 0; text-transform: uppercase; }
        .day { height: 28px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #475569; border-radius: 7px; cursor: pointer; transition: 0.15s; }
        .day:hover:not(.empty) { background: #f8fafc; color: #0f172a; }
        .day.selected { background: ${themeColor} !important; color: #fff !important; font-weight: 700; box-shadow: 0 2px 8px ${themeColor}25; }
        .day.empty { cursor: default; }

        .pos-dt-time-side { width: 125px; padding: 14px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .time-box-title { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; }
        
        .time-stepper { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 4px; background: #fff; padding: 6px; border-radius: 10px; border: 1px solid #e2e8f0; width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
        .step-col { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 36px; }
        .step-btn { border: none; background: none; color: ${themeColor}; cursor: pointer; font-size: 11px; transition: 0.15s; padding: 2px 0; width: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.8; }
        .step-btn:hover { opacity: 1; transform: scale(1.15); }
        .step-btn:active { transform: scale(0.95); }
        .step-val { font-size: 14px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
        .step-sep { font-size: 14px; font-weight: 800; color: #94a3b8; padding: 0 1px; }
        
        .ampm-toggle { display: flex; gap: 2px; background: #e2e8f0; padding: 2px; border-radius: 8px; width: 100%; }
        .ampm-p { border: none; background: none; color: #64748b; padding: 4px 0; border-radius: 6px; font-size: 9.5px; font-weight: 700; cursor: pointer; transition: 0.15s; flex: 1; text-align: center; }
        .ampm-p.on { background: #fff; color: ${themeColor}; font-weight: 800; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
        
        .now-btn { width: 100%; padding: 7px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: ${themeColor}; font-size: 10.5px; font-weight: 700; cursor: pointer; transition: 0.15s; margin-top: auto; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
        .now-btn:hover { border-color: ${themeColor} !important; color: #fff !important; background: ${themeColor} !important; box-shadow: 0 2px 8px ${themeColor}25; }

        @media (max-width: 480px) {
          .pos-dt-dropdown-side {
            flex-direction: column;
            animation: popInMobile 0.15s ease-out;
          }
          @keyframes popInMobile {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .pos-dt-calendar {
            border-right: none;
            border-bottom: 1px solid #f1f5f9;
            padding: 12px;
          }
          .pos-dt-time-side {
            width: 100%;
            padding: 12px;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
