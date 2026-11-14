import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { FaCalendarAlt, FaCheck, FaTimes, FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import { formatTzDate } from '../../../../utils/timezoneUtils';
import { useNotification } from '../../../../context/NotificationContext';
import NiceSelect from '../../../../components/NiceSelect';
import PremiumDateTimePicker from '../../../../components/PremiumDateTimePicker';
import HrInfoButton from '../../../../components/hr/HrInfoButton';
import { HistoryToolbar, HistTableWrap, HistTable, HistActionGroup } from '../../../../components/PremiumOrdersUI';

export default function LeaveManagement({ embedded = false }) {
  const router = useRouter();
  const { notify, showConfirm } = useNotification();
  const [leaves, setLeaves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);

  const showToast = (msg, type = 'success') => {
    notify(type === 'success' ? 'success' : 'error', msg);
  };

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=leaves');
    }
  }, [embedded, router]);
  
  // Create / Edit Form
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('UNPAID');
  const [status, setStatus] = useState('PENDING');
  const [reason, setReason] = useState('');

  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [leavesRes, empRes] = await Promise.all([
        hrService.getAllLeaveRequests(),
        hrService.getAllEmployees()
      ]);
      setLeaves(leavesRes.data || []);
      setEmployees(empRes.data || []);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const activeEmployees = employees.filter(emp => emp.isActive !== false);

  const handleOpenCreate = () => {
    setEditingLeave(null);
    setEmployeeId(activeEmployees.length > 0 ? activeEmployees[0].id : '');
    setStartDate(new Date().toISOString().substring(0, 10));
    setEndDate(new Date().toISOString().substring(0, 10));
    setLeaveType('UNPAID');
    setStatus('PENDING');
    setReason('');
    setShowModal(true);
  };

  const handleOpenEdit = (leave) => {
    setEditingLeave(leave);
    setEmployeeId(leave.employeeId || (leave.employee ? leave.employee.id : ''));
    setStartDate(leave.startDate ? leave.startDate.substring(0, 10) : '');
    setEndDate(leave.endDate ? leave.endDate.substring(0, 10) : '');
    setLeaveType(leave.leaveType || 'UNPAID');
    setStatus(leave.status || 'PENDING');
    setReason(leave.reason || '');
    setShowModal(true);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await hrService.updateLeaveStatus(id, newStatus);
      showToast("Status updated successfully", "success");
      fetchData();
    } catch (error) {
      const msg = error.response?.data?.message || "Failed to update status";
      showToast(msg, "error");
    }
  };

  const handleDeleteLeave = (leave) => {
    showConfirm({
      title: 'Delete Leave Request',
      message: 'Are you sure you want to delete this leave request?',
      type: 'confirm',
      confirmText: 'Delete Leave',
      confirmVariant: 'danger',
      showCancel: true,
      onConfirm: async () => {
        try {
          await hrService.deleteLeaveRequest(leave.id);
          showToast("Leave request deleted", "success");
          fetchData();
        } catch (error) {
          console.error("Failed to delete leave request", error);
          const errorMsg = error.response?.data?.message || error.message || 'Failed to delete leave request.';
          showConfirm({
            title: 'Cannot Delete Leave',
            message: errorMsg,
            type: 'error',
            confirmText: 'Got It',
            confirmVariant: 'primary',
            showCancel: false,
          });
        }
      }
    });
  };

  const handleSaveLeave = async (e) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate) return;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      showToast("Invalid Date Range: From Date cannot be later than To Date.", "error");
      return;
    }
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    if (startYear < 2000 || startYear > 2100 || endYear < 2000 || endYear > 2100) {
      showToast("Invalid Date Range: Year must be between 2000 and 2100.", "error");
      return;
    }
    const diffTime = end - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const payload = {
      employeeId,
      startDate,
      endDate,
      totalDays: diffDays,
      leaveType,
      reason,
      status
    };

    try {
      if (editingLeave) {
        await hrService.updateLeaveRequest(editingLeave.id, payload);
      } else {
        await hrService.createLeaveRequest(payload);
      }
      setShowModal(false);
      setEditingLeave(null);
      showToast(editingLeave ? "Leave updated successfully" : "Leave created successfully", "success");
      fetchData();
    } catch (error) {
      console.error("Failed to save leave", error);
      const msg = error.response?.data?.message || "Failed to save leave request";
      showToast(msg, "error");
    }
  };

  return (
    <DashboardLayout title="Leave Management" subtitle="Approve, edit, or reject employee leave requests." bare={embedded}>
      <Head>
        <title>Leaves | Cafe QR</title>
      </Head>

      <HistoryToolbar style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{leaves.length} leave request{leaves.length === 1 ? '' : 's'}</span>
        <button className="btn-primary" onClick={handleOpenCreate}>
          <FaPlus /> New Leave Request
        </button>
      </HistoryToolbar>

      <HistTableWrap>
        {isLoading ? (
          <div className="loading-state">Loading leaves...</div>
        ) : (
          <HistTable>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Dates</th>
                <th>Type</th>
                <th>Days</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">No leave requests found.</td>
                </tr>
              ) : (
                leaves.map(leave => (
                  <tr key={leave.id}>
                    <td className="font-bold">{leave.employeeName}</td>
                    <td>{formatTzDate(leave.startDate, null, { format: 'date' })} - {formatTzDate(leave.endDate, null, { format: 'date' })}</td>
                    <td><span className={`type-badge ${leave.leaveType.toLowerCase()}`}>{leave.leaveType}</span></td>
                    <td>{leave.totalDays}</td>
                    <td><span className={`status-badge ${leave.status.toLowerCase()}`}>{leave.status}</span></td>
                    <td>
                      <HistActionGroup>
                        {leave.status !== 'APPROVED' && (
                          <button onClick={() => handleStatusChange(leave.id, 'APPROVED')} className="icon-btn approve" title="Approve Request">
                            <FaCheck />
                          </button>
                        )}
                        {leave.status !== 'REJECTED' && (
                          <button onClick={() => handleStatusChange(leave.id, 'REJECTED')} className="icon-btn reject" title="Reject Request">
                            <FaTimes />
                          </button>
                        )}
                        <button onClick={() => handleOpenEdit(leave)} className="icon-btn edit" title="Edit Request">
                          <FaEdit />
                        </button>
                        <button onClick={() => handleDeleteLeave(leave)} className="icon-btn delete" title="Delete Request">
                          <FaTrash />
                        </button>
                      </HistActionGroup>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </HistTable>
        )}
      </HistTableWrap>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3>{editingLeave ? 'Edit Leave Request' : 'Add Leave Request'}</h3>
            <form onSubmit={handleSaveLeave}>
              <div className="form-group mb-4">
                <label>Employee</label>
                <NiceSelect
                  value={employeeId}
                  onChange={(val) => setEmployeeId(val)}
                  placeholder="Select Employee"
                  options={employees
                    .filter(emp => emp.isActive !== false || emp.id === employeeId)
                    .map(emp => ({
                      value: emp.id,
                      label: `${emp.firstName} ${emp.lastName || ''}`.trim() + (!emp.isActive ? ' (Inactive)' : ''),
                    }))}
                />
              </div>
              <div className="flex gap-4 mb-4">
                <div className="form-group flex-1">
                  <label>Start Date</label>
                  <PremiumDateTimePicker dateOnly value={startDate} onChange={val => setStartDate(val)} />
                </div>
                <div className="form-group flex-1">
                  <label>End Date</label>
                  <PremiumDateTimePicker dateOnly value={endDate} onChange={val => setEndDate(val)} />
                </div>
              </div>
              <div className="flex gap-4 mb-4">
                <div className="form-group flex-1">
                  <label>Leave Type</label>
                  <NiceSelect
                    value={leaveType}
                    onChange={val => setLeaveType(val)}
                    options={[
                      { value: 'UNPAID', label: 'Unpaid Leave' },
                      { value: 'PAID', label: 'Paid Leave / Vacation' },
                      { value: 'SICK', label: 'Sick Leave' },
                      { value: 'CASUAL', label: 'Casual Leave' },
                    ]}
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Status</label>
                  <NiceSelect
                    value={status}
                    onChange={val => setStatus(val)}
                    options={[
                      { value: 'PENDING', label: 'Pending' },
                      { value: 'APPROVED', label: 'Approved' },
                      { value: 'REJECTED', label: 'Rejected' },
                    ]}
                  />
                </div>
              </div>
              <div className="form-group mb-6">
                <label>Reason / Notes</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows="2" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => { setShowModal(false); setEditingLeave(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{editingLeave ? 'Save Changes' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}



      <style jsx>{`
        ._t {
          position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 12px;
          display: flex; align-items: center; gap: 12px; color: white; font-weight: 700; font-size: 14px;
          cursor: pointer; z-index: 99999; animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }
        ._t.success { background: #15803d; }
        ._t.error { background: #b91c1c; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        .glass-panel {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-top: 3px solid #f97316;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }
        .table-container { overflow-x: auto; }
        .modern-table { width: 100%; border-collapse: collapse; text-align: left; }
        .modern-table th { padding: 16px; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
        .modern-table td { padding: 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #475569; font-size: 14px; font-weight: 500; }
        .font-bold { font-weight: 700; color: #1e293b; }
        
        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .status-badge.approved { background: #dcfce7; color: #15803d; }
        .status-badge.pending { background: #fef3c7; color: #b45309; }
        .status-badge.rejected { background: #fee2e2; color: #b91c1c; }

        .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #f1f5f9; color: #475569; }
        .type-badge.paid { background: #fff7ed; color: #c2410c; }

        .btn-primary { display: flex; gap: 8px; align-items: center; padding: 10px 20px; border-radius: 12px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; font-weight: 600; border: none; cursor: pointer; }
        .btn-secondary {
          padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1;
          background: #ffffff; color: #475569; font-weight: 600; cursor: pointer;
        }
        
        .action-buttons { display: flex; gap: 8px; align-items: center; }
        .icon-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s; font-size: 13px;
        }
        .icon-btn.approve { background: #dcfce7; color: #16a34a; }
        .icon-btn.approve:hover { background: #bbf7d0; }
        .icon-btn.reject { background: #fee2e2; color: #dc2626; }
        .icon-btn.reject:hover { background: #fca5a5; }
        .icon-btn.edit { background: #f1f5f9; color: #f97316; }
        .icon-btn.edit:hover { background: #fff7ed; }
        .icon-btn.delete { background: #fef2f2; color: #ef4444; }
        .icon-btn.delete:hover { background: #fee2e2; }

        .empty-state, .loading-state { text-align: center; padding: 40px !important; color: #64748b; font-weight: 600; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal-content { width: 100%; max-width: 500px; padding: 32px; background: white; border-radius: 20px; }
        .modal-content h3 { margin: 0 0 24px; font-size: 20px; }
        
        .form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: #475569; }
        .form-group input, .form-group select, .form-group textarea { 
          width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #cbd5e1; 
          outline: none; color: #1e293b; background: #f8fafc; font-size: 14px;
        }
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
          border-color: #f97316; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); background: #fff;
        }
      `}</style>
    </DashboardLayout>
  );
}

