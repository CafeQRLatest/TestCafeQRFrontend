import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { FaCalendarAlt, FaCheck, FaTimes, FaPlus, FaEdit, FaTrash } from 'react-icons/fa';

export default function LeaveManagement({ embedded = false }) {
  const router = useRouter();
  const [leaves, setLeaves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
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

  const handleOpenCreate = () => {
    setEditingLeave(null);
    setEmployeeId(employees.length > 0 ? employees[0].id : '');
    setStartDate('');
    setEndDate('');
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

  const handleDeleteLeave = async (id) => {
    if (!confirm("Are you sure you want to delete this leave request?")) return;
    try {
      await hrService.deleteLeaveRequest(id);
      showToast("Leave request deleted", "success");
      fetchData();
    } catch (error) {
      console.error("Failed to delete leave request", error);
      showToast("Failed to delete leave request", "error");
    }
  };

  const handleSaveLeave = async (e) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate) return;
    
    // basic date math for totalDays
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

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

      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={handleOpenCreate}>
          <FaPlus /> New Leave Request
        </button>
      </div>

      <div className="table-container glass-panel">
        {isLoading ? (
          <div className="loading-state">Loading leaves...</div>
        ) : (
          <table className="modern-table">
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
                    <td>{new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}</td>
                    <td><span className={`type-badge ${leave.leaveType.toLowerCase()}`}>{leave.leaveType}</span></td>
                    <td>{leave.totalDays}</td>
                    <td><span className={`status-badge ${leave.status.toLowerCase()}`}>{leave.status}</span></td>
                    <td>
                      <div className="action-buttons">
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
                        <button onClick={() => handleDeleteLeave(leave.id)} className="icon-btn delete" title="Delete Request">
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3>{editingLeave ? 'Edit Leave Request' : 'Add Leave Request'}</h3>
            <form onSubmit={handleSaveLeave}>
              <div className="form-group mb-4">
                <label>Employee</label>
                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} required>
                  <option value="">Select Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4 mb-4">
                <div className="form-group flex-1">
                  <label>Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
                <div className="form-group flex-1">
                  <label>End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
              </div>
              <div className="flex gap-4 mb-4">
                <div className="form-group flex-1">
                  <label>Leave Type</label>
                  <select value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                    <option value="PAID">Paid Leave</option>
                    <option value="UNPAID">Unpaid Leave</option>
                    <option value="SICK">Sick Leave</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
              </div>
              <div className="form-group mb-6">
                <label>Reason</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows="3" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => { setShowModal(false); setEditingLeave(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{editingLeave ? 'Save Changes' : 'Save Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`_t ${toast.type}`} onClick={() => setToast(null)}>
          {toast.type === 'success' ? <FaCheck /> : <FaTimes />}
          <span>{toast.msg}</span>
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
          background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
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
        .type-badge.paid { background: #e0e7ff; color: #4338ca; }

        .btn-primary { display: flex; gap: 8px; align-items: center; padding: 10px 20px; border-radius: 12px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; font-weight: 600; border: none; cursor: pointer; }
        .btn-secondary { padding: 10px 20px; border-radius: 12px; background: #f1f5f9; color: #475569; font-weight: 600; border: none; cursor: pointer; }
        
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
        .icon-btn.edit { background: #f1f5f9; color: #3b82f6; }
        .icon-btn.edit:hover { background: #dbeafe; }
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

