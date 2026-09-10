import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import { downloadPayslipPdf } from '../../../../utils/payslipPdf';
import { FaMoneyCheckAlt, FaPlay, FaFileDownload, FaEye, FaSync, FaTrash, FaPrint } from 'react-icons/fa';

export default function PayrollDashboard({ embedded = false }) {
  const router = useRouter();
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  
  // New Run Form State
  const [newRunName, setNewRunName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Salary Slips Modal State
  const [selectedRun, setSelectedRun] = useState(null);
  const [slips, setSlips] = useState([]);
  const [isLoadingSlips, setIsLoadingSlips] = useState(false);
  const [showSlipsModal, setShowSlipsModal] = useState(false);
  
  // Printable Payslip State
  const [selectedSlipForPrint, setSelectedSlipForPrint] = useState(null);

  // Sync Modal State
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncRunId, setSyncRunId] = useState(null);
  const [syncPaymentMethod, setSyncPaymentMethod] = useState('BANK_TRANSFER');

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=payroll');
    }
  }, [embedded, router]);

  useEffect(() => {
    fetchPayrollRuns();
  }, []);

  const fetchPayrollRuns = async () => {
    try {
      setIsLoading(true);
      const res = await hrService.getAllPayrollRuns();
      setPayrollRuns(res.data || []);
    } catch (error) {
      console.error("Failed to fetch payroll runs", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitiateRun = async (e) => {
    e.preventDefault();
    if (!newRunName || !startDate || !endDate) return;

    try {
      setIsRunning(true);
      await hrService.initiatePayrollRun({
        name: newRunName,
        startDate: startDate,
        endDate: endDate
      });
      alert('Payroll calculation complete!');
      setNewRunName('');
      setStartDate('');
      setEndDate('');
      fetchPayrollRuns();
    } catch (error) {
      console.error("Failed to run payroll", error);
      alert('Error running payroll. Check logs.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleViewSlips = async (run) => {
    setSelectedRun(run);
    setShowSlipsModal(true);
    try {
      setIsLoadingSlips(true);
      const res = await hrService.getSlipsForRun(run.id);
      setSlips(res.data || []);
    } catch (error) {
      console.error("Failed to fetch slips", error);
      alert("Failed to fetch salary slips.");
    } finally {
      setIsLoadingSlips(false);
    }
  };

  const handleDownloadACH = async (runId) => {
    try {
      const response = await hrService.downloadAchExport(runId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ACH_Export_${runId}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Failed to download ACH", error);
      alert("Failed to download ACH file.");
    }
  };

  const openSyncModal = (runId) => {
    setSyncRunId(runId);
    setSyncPaymentMethod('BANK_TRANSFER');
    setShowSyncModal(true);
  };

  const confirmSyncAccounting = async () => {
    if (!syncRunId) return;
    try {
      setIsLoading(true);
      await hrService.syncToAccounting(syncRunId, syncPaymentMethod);
      alert("Payroll successfully synchronized with Accounting Expenses!");
      setShowSyncModal(false);
      setSyncRunId(null);
      fetchPayrollRuns();
    } catch (error) {
      console.error("Failed to sync accounting", error);
      alert(error.response?.data?.message || error.message || "Failed to sync with accounting.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRun = async (runId) => {
    if (!confirm("Are you sure you want to delete this payroll run and all its generated payslips?")) return;
    try {
      await hrService.deletePayrollRun(runId);
      fetchPayrollRuns();
    } catch (error) {
      console.error("Failed to delete payroll run", error);
      alert("Failed to delete payroll run.");
    }
  };

  return (
    <DashboardLayout title="Payroll Processing" subtitle="Calculate salaries, generate payslips, and export banking files." bare={embedded}>
      <Head>
        <title>Payroll | Cafe QR</title>
      </Head>

      <div className="payroll-wrapper">
        
        {/* Initiate New Run Section */}
        <div className="initiate-card glass-panel">
          <div className="card-header">
            <h3><FaPlay className="text-orange-500" /> Initiate Payroll Run</h3>
            <p>Select the date range to automatically calculate base pay, hourly wages, and deductions.</p>
          </div>
          
          <form className="run-form" onSubmit={handleInitiateRun}>
            <div className="form-group">
              <label>Run Name</label>
              <input 
                type="text" 
                placeholder="e.g. September 2026 Payroll"
                value={newRunName}
                onChange={(e) => setNewRunName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Start Date</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={isRunning}>
              {isRunning ? 'Calculating...' : 'Run Payroll Engine'}
            </button>
          </form>
        </div>

        {/* History Section */}
        <h3 className="section-title">Past Payroll Runs</h3>
        <div className="table-container glass-panel">
          {isLoading ? (
            <div className="loading-state">Loading history...</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Run Name</th>
                  <th>Period</th>
                  <th>Total Payout</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payrollRuns.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-state">No payroll runs found.</td>
                  </tr>
                ) : (
                  payrollRuns.map(run => (
                    <tr key={run.id}>
                      <td className="font-bold">{run.name}</td>
                      <td>{new Date(run.startDate).toLocaleDateString()} - {new Date(run.endDate).toLocaleDateString()}</td>
                      <td className="text-emerald font-bold">${run.totalAmount?.toFixed(2) || '0.00'}</td>
                      <td>
                        <span className={`status-badge ${run.status ? run.status.toLowerCase() : 'completed'}`}>
                          {run.status || 'COMPLETED'}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="btn-action view" 
                            title="View Slips"
                            onClick={() => handleViewSlips(run)}
                          >
                            <FaEye /> Slips
                          </button>
                          <button 
                            className="btn-action download" 
                            title="Download ACH NACHA format"
                            onClick={() => handleDownloadACH(run.id)}
                          >
                            <FaFileDownload /> ACH
                          </button>
                          {run.status !== 'PAID' && (
                            <button 
                              className="btn-action sync" 
                              title="Sync to Accounting Expenses"
                              onClick={() => openSyncModal(run.id)}
                            >
                              <FaSync /> Sync
                            </button>
                          )}
                          <button 
                            className="btn-action delete" 
                            title="Delete Payroll Run"
                            onClick={() => handleDeleteRun(run.id)}
                          >
                            <FaTrash /> Delete
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
      </div>

      {/* Salary Slips Modal */}
      {showSlipsModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel modal-wide">
            <div className="modal-header-flex">
              <div>
                <h3>Salary Slips - {selectedRun?.name}</h3>
                <p className="modal-sub">
                  {selectedRun && `${new Date(selectedRun.startDate).toLocaleDateString()} - ${new Date(selectedRun.endDate).toLocaleDateString()}`}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setShowSlipsModal(false)}>Close</button>
            </div>

            <div className="table-container">
              {isLoadingSlips ? (
                <div className="loading-state">Loading generated salary slips...</div>
              ) : (
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Worked Hours</th>
                      <th>Unpaid Leave Days</th>
                      <th>Gross Pay</th>
                      <th>Total Deductions</th>
                      <th>Net Pay</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slips.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="empty-state">No salary slips generated for this run.</td>
                      </tr>
                    ) : (
                      slips.map(slip => (
                        <tr key={slip.id}>
                          <td className="font-bold text-slate">{slip.employeeName}</td>
                          <td>{slip.totalWorkedHours !== null ? `${slip.totalWorkedHours} hrs` : 'N/A'}</td>
                          <td>{slip.totalUnpaidLeaveDays !== null ? `${slip.totalUnpaidLeaveDays} days` : '0 days'}</td>
                          <td className="font-bold">${slip.grossPay?.toFixed(2)}</td>
                          <td className="font-bold text-red">-${slip.totalDeductions?.toFixed(2)}</td>
                          <td className="font-bold text-green">${slip.netPay?.toFixed(2)}</td>
                          <td>
                            <span className="status-badge processed">{slip.status}</span>
                          </td>
                          <td>
                            <button
                              className="btn-action view"
                              title="Print Official Payslip"
                              onClick={() => setSelectedSlipForPrint(slip)}
                            >
                              <FaPrint /> Print
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Payslip Modal */}
      {selectedSlipForPrint && (
        <div className="modal-overlay payslip-modal-overlay">
          <div className="modal-content glass-panel payslip-printable-container">
            <div className="no-print modal-header-flex" style={{ marginBottom: '16px' }}>
              <h3>Official Employee Payslip</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-primary" onClick={() => downloadPayslipPdf(selectedSlipForPrint, selectedRun)} style={{ height: '38px', padding: '8px 16px' }}>
                  <FaFileDownload /> Download PDF
                </button>
                <button className="btn-secondary" onClick={() => setSelectedSlipForPrint(null)}>
                  Close
                </button>
              </div>
            </div>

            {/* Printable Slip Content */}
            <div id="printable-payslip" className="payslip-card">
              <div className="payslip-header">
                <div className="company-info">
                  <h2>CAFE QR RESTAURANT</h2>
                  <p>Official Payroll Statement & Employee Payslip</p>
                </div>
                <div className="pay-period-box">
                  <span className="label">PAY PERIOD</span>
                  <span className="value">
                    {selectedRun ? `${new Date(selectedRun.startDate).toLocaleDateString()} - ${new Date(selectedRun.endDate).toLocaleDateString()}` : 'N/A'}
                  </span>
                </div>
              </div>

              <hr className="divider" />

              <div className="emp-details-grid">
                <div>
                  <span className="meta-label">EMPLOYEE NAME</span>
                  <div className="meta-value">{selectedSlipForPrint.employeeName}</div>
                </div>
                <div>
                  <span className="meta-label">EMPLOYEE ID</span>
                  <div className="meta-value">{selectedSlipForPrint.employeeId ? selectedSlipForPrint.employeeId.substring(0,8).toUpperCase() : 'N/A'}</div>
                </div>
                <div>
                  <span className="meta-label">WORKED HOURS</span>
                  <div className="meta-value">{selectedSlipForPrint.totalWorkedHours ?? '—'} hrs</div>
                </div>
                <div>
                  <span className="meta-label">UNPAID LEAVES</span>
                  <div className="meta-value">{selectedSlipForPrint.totalUnpaidLeaveDays ?? 0} days</div>
                </div>
              </div>

              <div className="pay-breakdown-tables">
                <div className="breakdown-box">
                  <h4>EARNINGS</h4>
                  <table className="mini-table">
                    <tbody>
                      <tr>
                        <td>Gross Pay (Base & Overtime)</td>
                        <td className="amount font-bold">${selectedSlipForPrint.grossPay?.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="breakdown-box">
                  <h4>DEDUCTIONS</h4>
                  <table className="mini-table">
                    <tbody>
                      <tr>
                        <td>Total Deductions & Advances</td>
                        <td className="amount font-bold text-red">-${selectedSlipForPrint.totalDeductions?.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="net-pay-banner">
                <div>
                  <span className="net-label">NET TAKE-HOME PAY</span>
                  <div className="net-amount">${selectedSlipForPrint.netPay?.toFixed(2)}</div>
                </div>
                <div className="pay-status">
                  STATUS: <strong>{selectedSlipForPrint.status || 'PAID'}</strong>
                </div>
              </div>

              <div className="signature-section">
                <div className="sig-block">
                  <div className="sig-line"></div>
                  <span>Employer / Manager Signature</span>
                </div>
                <div className="sig-block">
                  <div className="sig-line"></div>
                  <span>Employee Signature</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '400px' }}>
            <div className="modal-header-flex">
              <h3>Sync to Accounting</h3>
              <button className="btn-secondary" onClick={() => setShowSyncModal(false)}>Close</button>
            </div>
            
            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label>Select Payment Method</label>
              <select 
                value={syncPaymentMethod}
                onChange={(e) => setSyncPaymentMethod(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none' }}
              >
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHECK">Check</option>
                <option value="ONLINE">Online / Other</option>
              </select>
            </div>

            <button 
              className="btn-primary" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={confirmSyncAccounting}
              disabled={isLoading}
            >
              {isLoading ? 'Syncing...' : 'Confirm Sync'}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .payroll-wrapper { display: flex; flex-direction: column; gap: 32px; animation: slideUp 0.4s ease-out; }
        
        .glass-panel {
          background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }

        .initiate-card { padding: 32px; background: linear-gradient(135deg, #fff 0%, #fff7ed 100%); }
        .card-header h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 20px; color: #1e293b; }
        .card-header p { margin: 0 0 24px; color: #64748b; font-size: 14px; }
        
        .text-orange-500 { color: #f97316; }
        .text-emerald { color: #10b981; }

        .run-form { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #475569; font-size: 13px; }
        .form-group input { 
          padding: 12px; border-radius: 12px; border: 1px solid #cbd5e1; 
          font-size: 14px; background: #f8fafc; color: #1e293b; outline: none; transition: all 0.2s; 
          width: 100%; min-width: 150px;
        }
        .form-group input:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }

        .btn-primary {
          padding: 12px 24px; border-radius: 12px; border: none; height: 46px;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white; font-weight: 700; cursor: pointer; transition: transform 0.2s;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3); display: flex; align-items: center; gap: 6px;
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-2px); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary { padding: 8px 16px; border-radius: 10px; background: #f1f5f9; color: #475569; font-weight: 600; border: none; cursor: pointer; }

        .section-title { font-size: 18px; color: #1e293b; margin: 0 0 -16px; padding-left: 8px; }

        .table-container { overflow-x: auto; }
        .modern-table { width: 100%; border-collapse: collapse; text-align: left; }
        .modern-table th {
          padding: 16px 24px; font-size: 12px; font-weight: 700; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0;
        }
        .modern-table td { padding: 16px 24px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #475569; font-size: 14px; font-weight: 500; }
        
        .font-bold { font-weight: 700; color: #1e293b; }
        .text-slate { color: #1e293b; }
        .text-red { color: #dc2626; }
        .text-green { color: #16a34a; font-size: 15px; }

        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .status-badge.processed, .status-badge.completed, .status-badge.generated { background: #dcfce7; color: #15803d; }
        .status-badge.pending, .status-badge.processing { background: #fef3c7; color: #b45309; }

        .action-buttons { display: flex; gap: 8px; }
        .btn-action {
          padding: 6px 12px; border-radius: 8px; border: none; font-size: 12px; font-weight: 700;
          display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s;
        }
        .btn-action.view { background: #f1f5f9; color: #3b82f6; }
        .btn-action.download { background: #f1f5f9; color: #8b5cf6; }
        .btn-action.sync { background: #f1f5f9; color: #10b981; }
        .btn-action.delete { background: #fef2f2; color: #ef4444; }
        .btn-action:hover { filter: brightness(0.95); }

        .empty-state, .loading-state { text-align: center; padding: 40px !important; color: #64748b; font-weight: 600; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px; }
        .modal-content { width: 100%; max-width: 900px; padding: 32px; background: white; border-radius: 20px; max-height: 85vh; overflow-y: auto; }
        .modal-header-flex { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .modal-header-flex h3 { margin: 0; font-size: 20px; color: #1e293b; }
        .modal-sub { margin: 4px 0 0; color: #64748b; font-size: 13px; }

        /* Payslip Card Styling */
        .payslip-modal-overlay { z-index: 1000; }
        .payslip-printable-container { max-width: 700px; background: white; border-radius: 16px; padding: 24px; }
        .payslip-card {
          border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; background: white; color: #0f172a;
        }
        .payslip-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .company-info h2 { margin: 0; font-size: 22px; font-weight: 900; color: #ea580c; letter-spacing: -0.02em; }
        .company-info p { margin: 4px 0 0; font-size: 12px; color: #64748b; font-weight: 600; }
        .pay-period-box { text-align: right; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .pay-period-box .label { display: block; font-size: 10px; font-weight: 800; color: #94a3b8; }
        .pay-period-box .value { font-size: 12px; font-weight: 700; color: #1e293b; }

        .divider { margin: 16px 0; border: none; border-top: 1px solid #e2e8f0; }

        .emp-details-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px; }
        .meta-label { display: block; font-size: 10px; font-weight: 800; color: #64748b; }
        .meta-value { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px; }

        .pay-breakdown-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .breakdown-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .breakdown-box h4 { margin: 0 0 8px; font-size: 12px; font-weight: 800; color: #475569; letter-spacing: 0.05em; }
        .mini-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .mini-table td { padding: 6px 0; border-bottom: 1px dashed #f1f5f9; }
        .mini-table td.amount { text-align: right; }

        .net-pay-banner {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white; padding: 16px 20px; border-radius: 12px;
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;
        }
        .net-label { font-size: 11px; font-weight: 800; letter-spacing: 0.05em; opacity: 0.9; }
        .net-amount { font-size: 28px; font-weight: 900; }
        .pay-status { font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; }

        .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 32px; padding-top: 16px; }
        .sig-block { text-align: center; }
        .sig-line { border-bottom: 1px solid #94a3b8; height: 30px; margin-bottom: 6px; }
        .sig-block span { font-size: 11px; color: #64748b; font-weight: 600; }

        @media print {
          body * { visibility: hidden; }
          .payslip-printable-container, #printable-payslip, #printable-payslip * { visibility: visible; }
          .payslip-printable-container {
            position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0;
            box-shadow: none; border: none; background: white;
          }
          .no-print { display: none !important; }
        }

        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </DashboardLayout>
  );
}

