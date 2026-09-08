import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { FaMoneyBillWave, FaCheck, FaTimes, FaPlus } from 'react-icons/fa';

export default function SalaryAdvances({ embedded = false }) {
  const router = useRouter();
  const [advances, setAdvances] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=advances');
    }
  }, [embedded, router]);
  
  // Create Form
  const [employeeId, setEmployeeId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState('');
  const [reason, setReason] = useState('');

  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [advancesRes, empRes] = await Promise.all([
        hrService.getAllAdvances(),
        hrService.getAllEmployees()
      ]);
      setAdvances(advancesRes.data || []);
      setEmployees(empRes.data || []);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await hrService.updateAdvanceStatus(id, status);
      fetchData();
    } catch (error) {
      alert("Failed to update status");
    }
  };

  const handleCreateAdvance = async (e) => {
    e.preventDefault();
    if (!employeeId || !totalAmount || !installmentAmount) return;
    
    try {
      await hrService.createAdvance({
        employeeId,
        advanceDate,
        totalAmount: parseFloat(totalAmount),
        monthlyInstallmentAmount: parseFloat(installmentAmount),
        remainingBalance: parseFloat(totalAmount),
        reason,
        status: 'PENDING'
      });
      setShowModal(false);
      fetchData();
    } catch (error) {
      alert("Error creating advance request.");
    }
  };

  return (
    <DashboardLayout title="Salary Advances & Loans" subtitle="Manage employee advances and automatic payroll deductions." bare={embedded}>
      <Head>
        <title>Advances | Cafe QR</title>
      </Head>

      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <FaPlus /> Issue Salary Advance
        </button>
      </div>

      <div className="table-container glass-panel">
        {isLoading ? (
          <div className="loading-state">Loading advances...</div>
        ) : (
          <table className="modern-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date Issued</th>
                <th>Total Loan</th>
                <th>Monthly Deduction</th>
                <th>Remaining Bal.</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {advances.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">No salary advances found.</td>
                </tr>
              ) : (
                advances.map(adv => (
                  <tr key={adv.id}>
                    <td className="font-bold">{adv.employeeName}</td>
                    <td>{new Date(adv.advanceDate).toLocaleDateString()}</td>
                    <td className="font-bold">${adv.totalAmount?.toFixed(2)}</td>
                    <td className="text-red-500">-${adv.monthlyInstallmentAmount?.toFixed(2)}/mo</td>
                    <td className="font-bold text-orange-600">${adv.remainingBalance?.toFixed(2)}</td>
                    <td><span className={`status-badge ${adv.status.toLowerCase()}`}>{adv.status}</span></td>
                    <td>
                      {adv.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleStatusChange(adv.id, 'APPROVED')} className="btn-action view text-emerald-600"><FaCheck /></button>
                          <button onClick={() => handleStatusChange(adv.id, 'REJECTED')} className="btn-action view text-red-600"><FaTimes /></button>
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
            <h3>Issue Salary Advance</h3>
            <form onSubmit={handleCreateAdvance}>
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
                  <label>Total Loan Amount ($)</label>
                  <input type="number" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} required />
                </div>
                <div className="form-group flex-1">
                  <label>Monthly Deduction ($)</label>
                  <input type="number" step="0.01" value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)} required />
                </div>
              </div>
              <div className="form-group mb-4">
                <label>Advance Issue Date</label>
                <input type="date" value={advanceDate} onChange={e => setAdvanceDate(e.target.value)} required />
              </div>
              <div className="form-group mb-6">
                <label>Reason / Notes</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows="2" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Issue Loan</button>
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
        .status-badge.paid { background: #e0e7ff; color: #4338ca; }

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
