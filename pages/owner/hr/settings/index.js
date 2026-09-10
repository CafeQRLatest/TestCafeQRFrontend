import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { FaSlidersH, FaSave, FaClock, FaCalculator, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';

export default function HrSettingsDashboard({ embedded = false }) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    standardHoursPerDay: '8.00',
    overtimeMultiplier: '1.50',
    weeklyOvertimeThreshold: '40.00',
    weeklyOvertimeThreshold: '40.00',
    overtimeMode: 'DAILY',
    shiftDayBoundaryHour: '4'
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=settings');
    }
  }, [embedded, router]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await hrService.getHrSettings();
      if (res.data) {
        setFormData({
          standardHoursPerDay: res.data.standardHoursPerDay ? String(res.data.standardHoursPerDay) : '8.00',
          overtimeMultiplier: res.data.overtimeMultiplier ? String(res.data.overtimeMultiplier) : '1.50',
          weeklyOvertimeThreshold: res.data.weeklyOvertimeThreshold ? String(res.data.weeklyOvertimeThreshold) : '40.00',
          overtimeMode: res.data.overtimeMode || 'DAILY',
          shiftDayBoundaryHour: res.data.shiftDayBoundaryHour !== undefined ? String(res.data.shiftDayBoundaryHour) : '4'
        });
      }
    } catch (err) {
      console.error('Failed to fetch HR settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setStatusMsg({ text: '', type: '' });
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    try {
      setIsSaving(true);
      setStatusMsg({ text: '', type: '' });

      const payload = {
        standardHoursPerDay: Number(formData.standardHoursPerDay),
        overtimeMultiplier: Number(formData.overtimeMultiplier),
        weeklyOvertimeThreshold: Number(formData.weeklyOvertimeThreshold),
        overtimeMode: formData.overtimeMode,
        shiftDayBoundaryHour: Number(formData.shiftDayBoundaryHour)
      };

      if (payload.standardHoursPerDay <= 0 || payload.standardHoursPerDay > 24) {
        setStatusMsg({ text: 'Standard daily working hours must be between 1 and 24 hours.', type: 'error' });
        setIsSaving(false);
        return;
      }

      if (payload.overtimeMultiplier < 1.0) {
        setStatusMsg({ text: 'Overtime multiplier cannot be less than 1.0x.', type: 'error' });
        setIsSaving(false);
        return;
      }

      const res = await hrService.updateHrSettings(payload);
      if (res.data) {
        setStatusMsg({ text: 'HR Policy & Overtime Settings updated successfully!', type: 'success' });
      }
    } catch (err) {
      console.error('Failed to save HR settings:', err);
      setStatusMsg({ text: 'Failed to save settings: ' + (err.response?.data?.message || err.message), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Preview Calculations
  const stdHrs = Number(formData.standardHoursPerDay) || 8.0;
  const otMult = Number(formData.overtimeMultiplier) || 1.5;
  const sampleRate = 15.0; // $15/hr sample
  const sampleWorked = Math.max(stdHrs + 2.0, 10.0); // 2 hrs overtime sample
  const sampleNormalPay = stdHrs * sampleRate;
  const sampleOtPay = 2.0 * (sampleRate * otMult);
  const sampleTotalPay = sampleNormalPay + sampleOtPay;

  return (
    <DashboardLayout title="HR & Overtime Policy" subtitle="Configure standard daily shift hours, overtime rate multipliers, and weekly thresholds" bare={embedded}>
      <Head>
        <title>HR Policy Settings | Cafe QR</title>
      </Head>

      <div className="hr-settings-wrapper">
        {isLoading ? (
          <div className="glass-panel loading-state">Loading HR Policy Configurations...</div>
        ) : (
          <form onSubmit={handleSave} className="settings-grid">
            {/* Policy Inputs Form */}
            <div className="glass-panel form-card">
              <div className="card-header">
                <FaSlidersH className="header-icon" />
                <div>
                  <h2>Overtime & Shift Rules</h2>
                  <p>Customize daily working hour thresholds and overtime pay multipliers for payroll.</p>
                </div>
              </div>

              {statusMsg.text && (
                <div className={`status-banner ${statusMsg.type}`}>
                  {statusMsg.type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
                  <span>{statusMsg.text}</span>
                </div>
              )}

              <div className="form-group">
                <label><FaClock className="label-icon" /> Standard Daily Working Hours</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.25"
                    min="1" 
                    max="24"
                    name="standardHoursPerDay" 
                    value={formData.standardHoursPerDay} 
                    onChange={handleChange}
                    required 
                  />
                  <span className="unit">Hours / Day</span>
                </div>
                <small className="help-text">Hours worked beyond this threshold in a single shift will be categorized as Overtime.</small>
              </div>

              <div className="form-group">
                <label><FaCalculator className="label-icon" /> Overtime Pay Multiplier</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.05"
                    min="1.0" 
                    max="5.0"
                    name="overtimeMultiplier" 
                    value={formData.overtimeMultiplier} 
                    onChange={handleChange}
                    required 
                  />
                  <span className="unit">x Rate (Multiplier)</span>
                </div>
                <small className="help-text">Multiplier applied to hourly rate for overtime hours (e.g. 1.50x for time-and-a-half, 2.00x for double-time).</small>
              </div>

              <div className="form-group">
                <label><FaClock className="label-icon" /> Weekly Overtime Threshold</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="1"
                    min="1" 
                    max="168"
                    name="weeklyOvertimeThreshold" 
                    value={formData.weeklyOvertimeThreshold} 
                    onChange={handleChange}
                    required 
                  />
                  <span className="unit">Hours / Week</span>
                </div>
                <small className="help-text">Total cumulative regular working hours per week before weekly overtime applies.</small>
              </div>

              <div className="form-group">
                <label>Overtime Calculation Mode</label>
                <select name="overtimeMode" value={formData.overtimeMode} onChange={handleChange}>
                  <option value="DAILY">Daily Threshold (Beyond {stdHrs} hrs/day)</option>
                  <option value="WEEKLY">Weekly Threshold (Beyond {formData.weeklyOvertimeThreshold} hrs/week)</option>
                  <option value="BOTH">Both (Higher of Daily or Weekly Overtime)</option>
                </select>
                <small className="help-text">Select whether overtime is evaluated on a daily shift basis or weekly total basis.</small>
              </div>

              <div className="form-group">
                <label><FaClock className="label-icon" /> Shift Day Boundary Hour</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="1"
                    min="0" 
                    max="23"
                    name="shiftDayBoundaryHour" 
                    value={formData.shiftDayBoundaryHour} 
                    onChange={handleChange}
                    required 
                  />
                  <span className="unit">Hour (0-23)</span>
                </div>
                <small className="help-text">Clock-ins before this hour belong to the previous calendar day (e.g. set to 4 for shifts running past midnight until 4 AM).</small>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  <FaSave /> {isSaving ? 'Saving Policy...' : 'Save HR Settings'}
                </button>
              </div>
            </div>

            {/* Live Calculation Preview Card */}
            <div className="glass-panel preview-card">
              <div className="card-header">
                <FaCalculator className="header-icon" />
                <div>
                  <h2>Calculation Simulator</h2>
                  <p>Live preview of how shift earnings are calculated using your policy rules.</p>
                </div>
              </div>

              <div className="simulation-box">
                <div className="sim-row">
                  <span className="sim-label">Sample Employee Shift:</span>
                  <span className="sim-val font-bold">{sampleWorked.toFixed(2)} Hours</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Base Hourly Rate:</span>
                  <span className="sim-val">${sampleRate.toFixed(2)} / hr</span>
                </div>

                <div className="sim-divider" />

                <div className="sim-row">
                  <span className="sim-label">Regular Hours ({stdHrs.toFixed(2)} hrs @ ${sampleRate}):</span>
                  <span className="sim-val">${sampleNormalPay.toFixed(2)}</span>
                </div>
                <div className="sim-row highlight-ot">
                  <span className="sim-label">Overtime (2.00 hrs @ ${sampleRate} × {otMult.toFixed(2)}x):</span>
                  <span className="sim-val">${sampleOtPay.toFixed(2)}</span>
                </div>

                <div className="sim-divider" />

                <div className="sim-row total-row">
                  <span className="sim-label">Total Shift Gross Pay:</span>
                  <span className="sim-val">${sampleTotalPay.toFixed(2)}</span>
                </div>
              </div>

              <div className="info-callout">
                <p>💡 <strong>Overnight Shifts (e.g. 4:00 PM – 2:00 AM):</strong> Shifts crossing midnight are automatically grouped as one continuous shift under the clock-in date. The 2 overtime hours will be multiplied by <strong>{otMult.toFixed(2)}x</strong> during payroll generation.</p>
              </div>
            </div>
          </form>
        )}
      </div>

      <style jsx>{`
        .hr-settings-wrapper { animation: slideUp 0.4s ease-out; }
        
        .glass-panel {
          background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); padding: 24px;
        }

        .settings-grid {
          display: grid; grid-template-columns: 1fr 380px; gap: 24px;
        }
        @media (max-width: 1024px) {
          .settings-grid { grid-template-columns: 1fr; }
        }

        .card-header {
          display: flex; align-items: center; gap: 14px; margin-bottom: 24px;
          border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;
        }
        .header-icon { font-size: 24px; color: #f97316; }
        .card-header h2 { margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #0f172a; }
        .card-header p { margin: 0; font-size: 13px; color: #64748b; }

        .status-banner {
          display: flex; align-items: center; gap: 10px; padding: 12px 16px;
          border-radius: 12px; font-size: 14px; font-weight: 600; margin-bottom: 20px;
        }
        .status-banner.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .status-banner.error { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }

        .form-group { margin-bottom: 20px; }
        .form-group label {
          display: flex; align-items: center; gap: 8px; font-size: 13px;
          font-weight: 700; color: #334155; margin-bottom: 8px;
        }
        .label-icon { color: #64748b; }

        .input-with-unit {
          display: flex; align-items: center; border: 1px solid #cbd5e1;
          border-radius: 12px; background: white; overflow: hidden;
          transition: border-color 0.2s;
        }
        .input-with-unit:focus-within { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        .input-with-unit input {
          flex: 1; padding: 12px 16px; border: none; outline: none;
          font-size: 15px; font-weight: 700; color: #0f172a;
        }
        .input-with-unit .unit {
          padding: 12px 16px; background: #f8fafc; color: #64748b;
          font-size: 13px; font-weight: 600; border-left: 1px solid #e2e8f0;
        }

        .form-group select {
          width: 100%; padding: 12px 16px; border-radius: 12px;
          border: 1px solid #cbd5e1; background: white; color: #0f172a;
          font-size: 14px; font-weight: 600; outline: none;
        }
        .form-group select:focus { border-color: #f97316; }

        .help-text { display: block; margin-top: 6px; font-size: 12px; color: #64748b; }

        .form-actions { margin-top: 28px; }
        .btn-primary {
          padding: 14px 28px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white; font-weight: 700; font-size: 15px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 10px;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3); transition: transform 0.2s;
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-2px); }
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

        .simulation-box {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 16px; display: flex; flex-direction: column; gap: 10px;
        }
        .sim-row { display: flex; justify-content: space-between; font-size: 13px; color: #475569; }
        .sim-val { font-weight: 600; color: #0f172a; }
        .sim-divider { height: 1px; background: #e2e8f0; margin: 4px 0; }
        .highlight-ot { color: #c2410c; }
        .highlight-ot .sim-val { color: #ea580c; font-weight: 700; }
        .total-row { font-size: 15px; font-weight: 800; color: #0f172a; }
        .total-row .sim-val { color: #166534; font-size: 17px; }

        .info-callout {
          margin-top: 16px; padding: 14px; background: #eff6ff;
          border: 1px solid #bfdbfe; border-radius: 12px; color: #1e40af; font-size: 12px; line-height: 1.5;
        }
        .info-callout p { margin: 0; }

        .loading-state { text-align: center; padding: 40px; color: #64748b; font-weight: 600; }

        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </DashboardLayout>
  );
}
