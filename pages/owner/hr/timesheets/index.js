import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { FaClock, FaEdit, FaTrash, FaPlus, FaCalendarAlt, FaTimes, FaSave, FaExclamationTriangle } from 'react-icons/fa';

export default function TimesheetsDashboard({ embedded = false }) {
  const router = useRouter();
  const [timesheets, setTimesheets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=timesheets');
    }
  }, [embedded, router]);
  
  // Date filters helper
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateStr(new Date());
  const thirtyDaysAgoStr = getLocalDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    attendanceDate: todayStr,
    clockInTime: '',
    clockOutTime: '',
    status: 'PRESENT',
    punchMethod: 'MANUAL'
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchTimesheets();
  }, [startDate, endDate]);

  const fetchInitialData = async () => {
    try {
      const empRes = await hrService.getAllEmployees();
      setEmployees(empRes.data || []);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    }
  };

  const fetchTimesheets = async () => {
    try {
      setIsLoading(true);
      const res = await hrService.getAllAttendance(startDate, endDate);
      setTimesheets(res.data || []);
    } catch (err) {
      console.error('Failed to fetch timesheets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingRecord(null);
    const now = new Date();
    const currentLocalISO = `${getLocalDateStr(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setFormData({
      employeeId: employees.length > 0 ? employees[0].id : '',
      attendanceDate: todayStr,
      clockInTime: currentLocalISO,
      clockOutTime: '',
      status: 'PRESENT',
      punchMethod: 'MANUAL'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record) => {
    setEditingRecord(record);
    setFormData({
      employeeId: record.employeeId,
      attendanceDate: record.attendanceDate || todayStr,
      clockInTime: record.clockInTime ? record.clockInTime.substring(0, 16) : '',
      clockOutTime: record.clockOutTime ? record.clockOutTime.substring(0, 16) : '',
      status: record.status || 'PRESENT',
      punchMethod: record.punchMethod || 'MANUAL'
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const formatLocalIso = (val) => {
        if (!val || !val.trim()) return null;
        if (val.length === 16) return val + ':00';
        return val;
      };

      const payload = {
        employeeId: formData.employeeId,
        attendanceDate: formData.attendanceDate,
        clockInTime: formData.status === 'ABSENT' ? `${formData.attendanceDate}T00:00:00` : formatLocalIso(formData.clockInTime),
        clockOutTime: formData.status === 'ABSENT' ? null : formatLocalIso(formData.clockOutTime),
        status: formData.status,
        punchMethod: formData.punchMethod
      };

      if (editingRecord) {
        await hrService.updateAttendance(editingRecord.id, payload);
      } else {
        await hrService.createManualAttendance(payload);
      }

      setIsModalOpen(false);
      fetchTimesheets();
    } catch (err) {
      console.error('Failed to save timecard:', err);
      alert('Failed to save timecard: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    try {
      await hrService.deleteAttendance(id);
      fetchTimesheets();
    } catch (err) {
      console.error('Failed to delete attendance record:', err);
      alert('Failed to delete record');
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return 'N/A';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoStr;
    }
  };

  return (
    <DashboardLayout title="Timesheets & Overrides" subtitle="Manage staff attendance and manual timecard overrides" bare={embedded}>
      <Head>
        <title>Timesheets | Cafe QR</title>
      </Head>

      <div className="timesheets-wrapper">
        <div className="info-alert glass-panel">
          <FaClock className="alert-icon" />
          <div className="alert-content">
            <h3>Manager Overrides</h3>
            <p>If an employee forgot to clock in via the Kiosk, you can manually adjust their timecard here to ensure accurate payroll calculations.</p>
          </div>
          <button className="btn-primary add-btn" onClick={handleOpenCreate}>
            <FaPlus /> Add Timecard
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="filter-bar glass-panel">
          <div className="filter-group">
            <FaCalendarAlt className="filter-icon" />
            <label>From:</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>To:</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={() => { setStartDate(todayStr); setEndDate(todayStr); }}>
            Today
          </button>
          <button className="btn-secondary" onClick={() => { setStartDate(thirtyDaysAgoStr); setEndDate(todayStr); }}>
            Last 30 Days
          </button>
        </div>

        <div className="table-container glass-panel">
          {isLoading ? (
            <div className="loading-state">Loading timesheets...</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Total Hours</th>
                  <th>Method</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No timesheets recorded for selected date range.</td>
                  </tr>
                ) : (
                  timesheets.map(record => {
                    const isOvertime = record.overtimeHours > 0 || (record.totalHoursWorked && record.totalHoursWorked > 8.0);
                    return (
                      <tr key={record.id}>
                        <td className="font-bold">{record.employeeName || 'Staff Member'}</td>
                        <td>{record.attendanceDate}</td>
                        <td className="time-badge in">
                          {record.status === 'ABSENT' || !record.clockInTime ? '--' : formatTime(record.clockInTime)}
                        </td>
                        <td className="time-badge out">
                          {record.status === 'ABSENT' 
                            ? '--' 
                            : (record.clockOutTime 
                                ? formatTime(record.clockOutTime) 
                                : (record.status === 'PRESENT' ? 'Active' : '--')
                              )
                          }
                        </td>
                        <td>
                          {record.totalHoursWorked ? `${record.totalHoursWorked} hrs` : '--'}
                          {isOvertime && <span className="overtime-flag"><FaExclamationTriangle /> OT</span>}
                        </td>
                        <td>
                          <span className={`method-badge ${(record.punchMethod || 'MANUAL').toLowerCase()}`}>
                            {(record.punchMethod || 'MANUAL').replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button className="icon-btn edit" onClick={() => handleOpenEdit(record)} title="Edit Timecard"><FaEdit /></button>
                            <button className="icon-btn delete" onClick={() => handleDelete(record.id)} title="Delete Timecard"><FaTrash /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Timecard Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container glass-panel">
            <div className="modal-header">
              <h2>{editingRecord ? 'Edit Timecard' : 'Add Manual Timecard'}</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><FaTimes /></button>
            </div>

            <form onSubmit={handleSave} className="modal-body">
              <div className="form-group">
                <label>Employee</label>
                <select 
                  value={formData.employeeId} 
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  required
                >
                  <option value="">Select Employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Attendance Date</label>
                <input 
                  type="date" 
                  value={formData.attendanceDate} 
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setFormData(prev => {
                      let newIn = prev.clockInTime;
                      let newOut = prev.clockOutTime;
                      if (newIn && newIn.length >= 10) {
                        newIn = newDate + newIn.substring(10);
                      }
                      if (newOut && newOut.length >= 10) {
                        newOut = newDate + newOut.substring(10);
                      }
                      return { ...prev, attendanceDate: newDate, clockInTime: newIn, clockOutTime: newOut };
                    });
                  }}
                  required 
                />
              </div>

              {formData.status !== 'ABSENT' ? (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Clock In Time</label>
                    <input 
                      type="datetime-local" 
                      value={formData.clockInTime} 
                      onChange={(e) => setFormData({ ...formData, clockInTime: e.target.value })}
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label>Clock Out Time (Optional)</label>
                    <input 
                      type="datetime-local" 
                      value={formData.clockOutTime} 
                      onChange={(e) => setFormData({ ...formData, clockOutTime: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div className="info-alert glass-panel" style={{ padding: '12px 16px', marginBottom: '16px', borderLeftColor: '#f97316' }}>
                  <FaExclamationTriangle style={{ color: '#f97316', fontSize: '18px' }} />
                  <div className="alert-content">
                    <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                      Time fields are disabled for Absences. A placeholder time (midnight) will be logged automatically.
                    </p>
                  </div>
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label>Status</label>
                  <select 
                    value={formData.status} 
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="PRESENT">Present</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Punch Method</label>
                  <select 
                    value={formData.punchMethod} 
                    onChange={(e) => setFormData({ ...formData, punchMethod: e.target.value })}
                  >
                    <option value="MANUAL">MANUAL (Override)</option>
                    <option value="PIN">PIN Entry</option>
                    <option value="FACE_SCAN">Face Scan</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  <FaSave /> {isSubmitting ? 'Saving...' : 'Save Timecard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .timesheets-wrapper { display: flex; flex-direction: column; gap: 24px; animation: slideUp 0.4s ease-out; }
        
        .glass-panel {
          background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }

        .info-alert {
          display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px;
          background: linear-gradient(to right, #eff6ff, #f8fafc);
          border-left: 4px solid #3b82f6; flex-wrap: wrap;
        }
        .alert-content { flex: 1; min-width: 250px; }
        .alert-icon { font-size: 28px; color: #3b82f6; }
        .info-alert h3 { margin: 0 0 4px; color: #1e293b; font-size: 16px; }
        .info-alert p { margin: 0; color: #475569; font-size: 14px; }
        .add-btn { white-space: nowrap; }

        .filter-bar {
          display: flex; align-items: center; gap: 16px; padding: 16px 24px; flex-wrap: wrap;
        }
        .filter-group { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #475569; }
        .filter-icon { color: #f97316; }
        .filter-group input {
          padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; background: white;
        }

        .btn-secondary {
          padding: 10px 16px; border-radius: 10px; border: 1px solid #cbd5e1;
          background: white; color: #475569; font-weight: 700; cursor: pointer; transition: background 0.2s;
        }
        .btn-secondary:hover { background: #f1f5f9; }

        .btn-primary {
          padding: 12px 24px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; gap: 8px;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3); transition: transform 0.2s;
        }
        .btn-primary:hover { transform: translateY(-2px); }

        .table-container { overflow-x: auto; }
        .modern-table { width: 100%; border-collapse: collapse; text-align: left; }
        .modern-table th {
          padding: 16px 24px; font-size: 12px; font-weight: 700; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0;
        }
        .modern-table td { padding: 16px 24px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        
        .font-bold { font-weight: 700; color: #1e293b; }
        
        .time-badge { font-family: monospace; font-weight: 600; padding: 4px 8px; border-radius: 6px; }
        .time-badge.in { background: #dcfce7; color: #15803d; }
        .time-badge.out { background: #f1f5f9; color: #475569; }

        .overtime-flag {
          display: inline-flex; align-items: center; gap: 4px; margin-left: 8px;
          padding: 2px 6px; background: #fef2f2; color: #ef4444; border-radius: 4px; font-size: 10px; font-weight: 800;
        }

        .method-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .method-badge.face_scan { background: #dbeafe; color: #1d4ed8; }
        .method-badge.pin { background: #fef3c7; color: #b45309; }
        .method-badge.manual { background: #f3e8ff; color: #7e22ce; }

        .action-buttons { display: flex; gap: 8px; }
        .icon-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
        }
        .icon-btn.edit { background: #f1f5f9; color: #3b82f6; }
        .icon-btn.edit:hover { background: #dbeafe; }
        .icon-btn.delete { background: #fef2f2; color: #ef4444; }
        .icon-btn.delete:hover { background: #fee2e2; }

        .empty-state { text-align: center; padding: 40px !important; color: #64748b; font-weight: 600; }
        .loading-state { text-align: center; padding: 40px; color: #64748b; font-weight: 600; }

        /* Modal styling */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center;
          z-index: 9999; animation: fadeIn 0.2s ease-out;
        }
        .modal-container {
          width: 95%; max-width: 550px; border-radius: 24px;
          margin: 20px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column;
          background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .modal-header {
          padding: 20px 24px; display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid rgba(226, 232, 240, 0.8);
        }
        .modal-header h2 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
        .close-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none; background: #f1f5f9; color: #64748b;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .close-btn:hover { background: #fee2e2; color: #ef4444; }
        .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 12px; font-weight: 700; color: #475569; }
        input, select {
          padding: 10px 14px; border-radius: 10px; border: 1px solid #cbd5e1;
          background: #f8fafc; font-size: 14px; color: #1e293b; width: 100%; outline: none;
        }
        input:focus, select:focus { border-color: #f97316; background: #fff; }
        .modal-footer {
          margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;
          display: flex; justify-content: flex-end; gap: 12px;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </DashboardLayout>
  );
}
