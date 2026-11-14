import React, { useState, useEffect } from 'react';
import { useNotification } from '../../../../context/NotificationContext';
import { useCurrencyDecimals } from '../../../../hooks/useCurrencyConfig';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { useCurrencySymbol } from '../../../../hooks/useCurrencySymbol';
import NiceSelect from '../../../../components/NiceSelect';
import PremiumDateTimePicker from '../../../../components/PremiumDateTimePicker';
import HrInfoButton from '../../../../components/hr/HrInfoButton';
import { HistoryToolbar, HistTableWrap, HistTable, HistActionGroup } from '../../../../components/PremiumOrdersUI';
import { FaMoneyBillWave, FaCheck, FaTimes, FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import { formatTzDate } from '../../../../utils/timezoneUtils';

export default function SalaryAdvances({ embedded = false }) {
  const { showConfirm } = useNotification();
  const currencyDecimals = useCurrencyDecimals();
  const router = useRouter();
  const currencySymbol = useCurrencySymbol();
  const [advances, setAdvances] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState(null);

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=advances');
    }
  }, [embedded, router]);
  
  // Create / Edit Form
  const [employeeId, setEmployeeId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [remainingBalance, setRemainingBalance] = useState('');
  const [advanceDate, setAdvanceDate] = useState('');
  const [status, setStatus] = useState('PENDING');
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

  const activeEmployees = employees.filter(emp => emp.isActive !== false);

  const handleOpenCreate = () => {
    setEditingAdvance(null);
    setEmployeeId(activeEmployees.length > 0 ? activeEmployees[0].id : '');
    setTotalAmount('');
    setInstallmentAmount('');
    setRemainingBalance('');
    setAdvanceDate(new Date().toISOString().substring(0, 10));
    setStatus('PENDING');
    setReason('');
    setShowModal(true);
  };

  const handleOpenEdit = (adv) => {
    setEditingAdvance(adv);
    setEmployeeId(adv.employeeId || (adv.employee ? adv.employee.id : ''));
    setTotalAmount(adv.totalAmount !== undefined && adv.totalAmount !== null ? String(adv.totalAmount) : '');
    setInstallmentAmount(adv.monthlyInstallmentAmount !== undefined && adv.monthlyInstallmentAmount !== null ? String(adv.monthlyInstallmentAmount) : '');
    setRemainingBalance(adv.remainingBalance !== undefined && adv.remainingBalance !== null ? String(adv.remainingBalance) : '');
    setAdvanceDate(adv.advanceDate ? adv.advanceDate.substring(0, 10) : '');
    setStatus(adv.status || 'PENDING');
    setReason(adv.reason || '');
    setShowModal(true);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await hrService.updateAdvanceStatus(id, newStatus);
      fetchData();
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Failed to update status.";
      showConfirm({
        title: 'Error Updating Status',
        message: msg,
        type: 'error',
        confirmText: 'OK',
        confirmVariant: 'primary',
        showCancel: false,
      });
    }
  };

  const handleDeleteAdvance = (adv) => {
    showConfirm({
      title: 'Delete Salary Advance',
      message: 'Are you sure you want to delete this salary advance record?',
      type: 'confirm',
      confirmText: 'Delete Advance',
      confirmVariant: 'danger',
      showCancel: true,
      onConfirm: async () => {
        try {
          await hrService.deleteAdvance(adv.id);
          fetchData();
        } catch (error) {
          console.error("Failed to delete salary advance", error);
          const errorMsg = error.response?.data?.message || error.message || 'Failed to delete salary advance.';
          showConfirm({
            title: 'Cannot Delete Advance',
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

  const handleSaveAdvance = async (e) => {
    e.preventDefault();
    if (!employeeId || !totalAmount || !installmentAmount) return;
    
    const parsedTotal = parseFloat(totalAmount);
    const parsedInstallment = parseFloat(installmentAmount);
    const parsedRemaining = remainingBalance !== '' ? parseFloat(remainingBalance) : parsedTotal;

    const payload = {
      employeeId,
      advanceDate,
      totalAmount: parsedTotal,
      monthlyInstallmentAmount: parsedInstallment,
      remainingBalance: parsedRemaining,
      reason,
      status
    };

    try {
      if (editingAdvance) {
        await hrService.updateAdvance(editingAdvance.id, payload);
      } else {
        await hrService.createAdvance(payload);
      }
      setShowModal(false);
      setEditingAdvance(null);
      fetchData();
    } catch (error) {
      console.error("Error saving advance request", error);
      const msg = error.response?.data?.message || error.message || 'Error saving advance request.';
      showConfirm({
        title: 'Error Saving Advance',
        message: msg,
        type: 'error',
        confirmText: 'OK',
        confirmVariant: 'primary',
        showCancel: false,
      });
    }
  };

  return (
    <DashboardLayout title="Salary Advances & Loans" subtitle="Manage employee advances, repayments, and automatic payroll deductions." bare={embedded}>
      <Head>
        <title>Advances | Cafe QR</title>
      </Head>

      <HistoryToolbar style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{advances.length} salary advance{advances.length === 1 ? '' : 's'}</span>
        <button className="btn-primary" onClick={handleOpenCreate}>
          <FaPlus /> Issue Salary Advance
        </button>
      </HistoryToolbar>

      <HistTableWrap>
        {isLoading ? (
          <div className="loading-state">Loading advances...</div>
        ) : (
          <HistTable>
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
                    <td>{formatTzDate(adv.advanceDate, null, { format: 'date' })}</td>
                    <td className="font-bold">{currencySymbol}{adv.totalAmount?.toFixed(currencyDecimals)}</td>
                    <td className="text-red-500">-{currencySymbol}{adv.monthlyInstallmentAmount?.toFixed(currencyDecimals)}/mo</td>
                    <td className="font-bold text-orange-600">{currencySymbol}{adv.remainingBalance?.toFixed(currencyDecimals)}</td>
                    <td><span className={`status-badge ${adv.status.toLowerCase()}`}>{adv.status}</span></td>
                    <td>
                      <HistActionGroup>
                        {adv.status !== 'APPROVED' && adv.status !== 'PAID' && (
                          <button onClick={() => handleStatusChange(adv.id, 'APPROVED')} className="icon-btn approve" title="Approve Loan">
                            <FaCheck />
                          </button>
                        )}
                        {adv.status !== 'REJECTED' && (
                          <button onClick={() => handleStatusChange(adv.id, 'REJECTED')} className="icon-btn reject" title="Reject Loan">
                            <FaTimes />
                          </button>
                        )}
                        <button onClick={() => handleOpenEdit(adv)} className="icon-btn edit" title="Edit Loan Record">
                          <FaEdit />
                        </button>
                        <button onClick={() => handleDeleteAdvance(adv)} className="icon-btn delete" title="Delete Loan Record">
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
            <h3>{editingAdvance ? 'Edit Salary Advance' : 'Issue Salary Advance'}</h3>
            <form onSubmit={handleSaveAdvance}>
              <div className="form-group mb-4">
                <label>Employee</label>
                <NiceSelect
                  value={employeeId}
                  onChange={val => setEmployeeId(val)}
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
                  <label>Total Loan Amount ({currencySymbol})</label>
                  <input type="number" step="0.01" min="0" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} required />
                </div>
                <div className="form-group flex-1">
                  <label>Monthly Deduction ({currencySymbol})</label>
                  <input type="number" step="0.01" min="0" value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)} required />
                </div>
              </div>
              {editingAdvance && (
                <div className="flex gap-4 mb-4">
                  <div className="form-group flex-1">
                    <label>Remaining Balance ({currencySymbol})</label>
                    <input type="number" step="0.01" min="0" value={remainingBalance} onChange={e => setRemainingBalance(e.target.value)} required />
                  </div>
                  <div className="form-group flex-1">
                    <label>Status</label>
                    <NiceSelect
                      value={status}
                      onChange={val => setStatus(val)}
                      options={[
                        { value: 'PENDING', label: 'Pending' },
                        { value: 'APPROVED', label: 'Approved' },
                        { value: 'PAID', label: 'Paid (Fully Cleared)' },
                        { value: 'REJECTED', label: 'Rejected' },
                      ]}
                    />
                  </div>
                </div>
              )}
              <div className="form-group mb-4">
                <label>Advance Issue Date</label>
                <PremiumDateTimePicker dateOnly value={advanceDate} onChange={val => setAdvanceDate(val)} />
              </div>
              <div className="form-group mb-6">
                <label>Reason / Notes</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows="2" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => { setShowModal(false); setEditingAdvance(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{editingAdvance ? 'Save Changes' : 'Issue Loan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}


      <style jsx>{`
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
        .status-badge.paid { background: #fff7ed; color: #c2410c; }

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

