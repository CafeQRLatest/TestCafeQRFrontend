import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { FaCalendarAlt, FaCheck, FaTimes, FaPlus } from 'react-icons/fa';

export default function LeaveManagement({ embedded = false }) {
  const router = useRouter();
  const [leaves, setLeaves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=leaves');
    }
  }, [embedded, router]);
  
  // Create Form
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('UNPAID');
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

  const handleStatusChange = async (id, status) => {
    try {
      await hrService.updateLeaveStatus(id, status);
      fetchData();
    } catch (error) {
      alert("Failed to update status");
    }
  };

  const handleCreateLeave = async (e) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate) return;
    
    // basic date math for totalDays
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    try {
      await hrService.createLeaveRequest({
        employeeId,
        startDate,
        endDate,
        totalDays: diffDays,
        leaveType,
        reason,
        status: 'PENDING'
      });
      setShowModal(false);
      fetchData();
    } catch (error) {
      alert("Error creating leave request.");
    }
  };

  return (
    <DashboardLayout title="Leave Management" subtitle="Approve or reject employee leave requests." bare={embedded}>
      <Head>
        <title>Leaves | Cafe QR</title>
      </Head>

      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={() => setShowModal(true)}>
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
                      {leave.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleStatusChange(leave.id, 'APPROVED')} className="btn-action view text-emerald-600"><FaCheck /></button>
                          <button onClick={() => handleStatusChange(leave.id, 'REJECTED')} className="btn-action view text-red-600"><FaTimes /></button>
                        </div>
                      )}
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
            <h3>Add Leave Request</h3>
            <form onSubmit={handleCreateLeave}>
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
              <div className="form-group mb-4">
                <label>Leave Type</label>
                <select value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                  <option value="PAID">Paid Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                  <option value="SICK">Sick Leave</option>
                </select>
              </div>
              <div className="form-group mb-6">
                <label>Reason</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows="3" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .glass-panel {
          background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        .table-container { overflow-x: auto; }
        .modern-table { width: 100%; border-collapse: collapse; text-align: left; }
        .modern-table th { padding: 16px; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
        .modern-table td { padding: 16px; border-bottom: 1px solid #f1f5f9; }
        .font-bold { font-weight: 700; color: #1e293b; }
        
        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .status-badge.approved { background: #dcfce7; color: #15803d; }
        .status-badge.pending { background: #fef3c7; color: #b45309; }
        .status-badge.rejected { background: #fee2e2; color: #b91c1c; }

        .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #f1f5f9; color: #475569; }
        .type-badge.paid { background: #e0e7ff; color: #4338ca; }

        .btn-primary { display: flex; gap: 8px; align-items: center; padding: 10px 20px; border-radius: 12px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; font-weight: 600; border: none; cursor: pointer; }
        .btn-secondary { padding: 10px 20px; border-radius: 12px; background: #f1f5f9; color: #475569; font-weight: 600; border: none; cursor: pointer; }
        .btn-action { padding: 6px; border-radius: 8px; border: none; background: #f1f5f9; cursor: pointer; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal-content { width: 100%; max-width: 500px; padding: 32px; background: white; }
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
