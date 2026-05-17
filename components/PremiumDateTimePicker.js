import React, { useState, useEffect, useRef } from 'react';
import { FaCalendarAlt, FaClock, FaChevronLeft, FaChevronRight, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { getBusinessNow as getBizNow } from '../utils/timezoneUtils';

export default function PremiumDateTimePicker({ value, onChange, themeColor = '#f97316', disabled = false }) {
  const { timezone } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [inputValue, setInputValue] = useState('');
  const wrapperRef = useRef(null);

  // Helper to get time in business timezone
  const getBusinessNow = () => getBizNow(timezone);

  const getLocalISO = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const formatDate = (date) => {
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleString([], { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  useEffect(() => {
    if (value && value.length > 5) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        if (viewDate.getMonth() !== d.getMonth() || viewDate.getFullYear() !== d.getFullYear()) {
          setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
        }
        setInputValue(formatDate(d));
      }
    } else {
      const d = getBusinessNow();
      setSelectedDate(d);
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      setInputValue(formatDate(d));
    }
  }, [value, timezone]);

  const handleSetNow = (e) => {
    e.preventDefault(); e.stopPropagation();
    const now = getBusinessNow();
    setSelectedDate(now);
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    if (onChange) onChange(getLocalISO(now));
    setIsOpen(false);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    const parsed = new Date(e.target.value);
    if (!isNaN(parsed.getTime())) {
      setSelectedDate(parsed);
      setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      if (onChange) onChange(getLocalISO(parsed));
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
    if (onChange) onChange(getLocalISO(newDate));
  };

  const adjustTime = (e, type, delta) => {
    e.preventDefault(); e.stopPropagation();
    const newDate = new Date(selectedDate);
    if (type === 'h') newDate.setHours(newDate.getHours() + delta);
    if (type === 'm') newDate.setMinutes(newDate.getMinutes() + delta);
    setSelectedDate(newDate);
    if (onChange) onChange(getLocalISO(newDate));
  };

  const toggleAMPM = (e) => {
    e.preventDefault(); e.stopPropagation();
    const newDate = new Date(selectedDate);
    const hour = newDate.getHours();
    if (hour >= 12) newDate.setHours(hour - 12);
    else newDate.setHours(hour + 12);
    setSelectedDate(newDate);
    if (onChange) onChange(getLocalISO(newDate));
  };

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const currentHour24 = selectedDate.getHours();
  const displayHour = currentHour24 % 12 || 12;
  const isPM = currentHour24 >= 12;
  const displayMin = String(selectedDate.getMinutes()).padStart(2, '0');

  return (
    <div className="premium-dt-picker" ref={wrapperRef}>
      <div className={`dt-trigger ${isOpen && !disabled ? 'active' : ''} ${disabled ? 'disabled' : ''}`} 
        onClick={() => !disabled && setIsOpen(!isOpen)}>
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

      {isOpen && (
        <div className="dt-dropdown-side" onClick={e => e.stopPropagation()}>
          <div className="dt-calendar">
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

          <div className="dt-time-side">
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
              <div className="ampm-toggle">
                <button type="button" className={`ampm-p ${!isPM ? 'on' : ''}`} onClick={(e) => toggleAMPM(e)}>AM</button>
                <button type="button" className={`ampm-p ${isPM ? 'on' : ''}`} onClick={(e) => toggleAMPM(e)}>PM</button>
              </div>
            </div>

            <button type="button" className="now-btn" onClick={handleSetNow}>Set Now</button>
          </div>
        </div>
      )}

      <style jsx>{`
        .premium-dt-picker { position: relative; width: 100%; user-select: none; }
        .dt-trigger {
          background: #fff;
          border: 1.5px solid #e2e8f0;
          padding: 8px 14px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dt-trigger:hover { border-color: ${themeColor}; background: #fcfdfe; }
        .dt-trigger.active, .dt-trigger:focus-within { 
          border-color: ${themeColor}; 
          box-shadow: 0 0 0 3px ${themeColor}15; 
          background: #fff;
        }
        .dt-trigger.disabled { background: #f8fafc; border-color: #e2e8f0; cursor: not-allowed; opacity: 0.7; }
        .dt-trigger.disabled .dt-input { cursor: not-allowed; }
        .dt-icon { color: ${themeColor}; font-size: 14px; opacity: 0.6; }
        .dt-input { border: none; background: none; outline: none; font-size: 13px; font-weight: 500; color: #64748b; flex: 1; padding: 0; pointer-events: auto; width: 100%; }
        .dt-input:focus { color: #1e293b; }
        .dt-chevron { font-size: 10px; color: #cbd5e1; transition: 0.2s; cursor: pointer; padding: 4px; }
        .dt-chevron.up { transform: rotate(180deg); }

        .dt-dropdown-side {
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border-radius: 16px;
          border: 1px solid #f8fafc;
          box-shadow: 0 10px 30px rgba(0,0,0,0.06);
          z-index: 1000;
          display: flex;
          overflow: hidden;
          animation: popIn 0.2s ease-out;
          width: 360px;
        }
        @keyframes popIn { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

        .dt-calendar { padding: 14px; flex: 1; border-right: 1px solid #fcfdfe; }
        .cal-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .cal-hdr span { font-weight: 600; font-size: 12px; color: #334155; }
        .cal-hdr button { border: none; background: #f8fafc; color: #cbd5e1; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .cal-hdr button:hover { background: ${themeColor}10; color: ${themeColor}; }

        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
        .day-name { font-size: 8px; font-weight: 700; color: #e2e8f0; text-align: center; padding: 4px 0; text-transform: uppercase; }
        .day { height: 28px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; color: #94a3b8; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .day:hover:not(.empty) { background: #f8fafc; color: #334155; }
        .day.selected { background: ${themeColor}; color: #fff; font-weight: 600; box-shadow: 0 4px 10px ${themeColor}15; }
        .day.empty { cursor: default; }

        .dt-time-side { width: 110px; padding: 14px; background: #fcfdfe; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .time-box-title { font-size: 8px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
        
        .time-stepper { display: flex; flex-direction: column; align-items: center; gap: 4px; background: #fff; padding: 8px; border-radius: 12px; border: 1px solid #f1f5f9; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
        .step-col { display: flex; flex-direction: column; align-items: center; gap: 0; width: 100%; }
        .step-btn { border: none; background: none; color: ${themeColor}; cursor: pointer; font-size: 16px; transition: 0.2s; padding: 6px 0; width: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.8; }
        .step-btn:hover { opacity: 1; transform: scale(1.2); }
        .step-btn:active { transform: scale(0.9); }
        .step-val { font-size: 18px; font-weight: 700; color: #1e293b; font-variant-numeric: tabular-nums; margin: -2px 0; }
        .step-sep { font-size: 12px; font-weight: 800; color: #cbd5e1; margin: -4px 0; }
        
        .ampm-toggle { display: flex; gap: 2px; background: #f1f5f9; padding: 3px; border-radius: 10px; margin-top: 4px; border: 1px solid #f1f5f9; width: 100%; }
        .ampm-p { border: none; background: none; color: #94a3b8; padding: 5px 0; border-radius: 7px; font-size: 9px; font-weight: 700; cursor: pointer; transition: 0.2s; flex: 1; text-align: center; }
        .ampm-p.on { background: #fff; color: ${themeColor}; box-shadow: 0 4px 8px rgba(0,0,0,0.04); }
        
        .now-btn { width: 100%; padding: 8px; border-radius: 10px; border: 1px solid #f1f5f9; background: #fff; color: ${themeColor}; font-size: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; margin-top: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .now-btn:hover { border-color: ${themeColor}; color: #fff; background: ${themeColor}; box-shadow: 0 4px 10px ${themeColor}20; }
      `}</style>
    </div>
  );
}
