import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import HrConfirmModal from '../../../../components/hr/HrConfirmModal';
import { FaPlus, FaCogs, FaEdit, FaTrash } from 'react-icons/fa';

export default function SalaryComponents({ embedded = false }) {
  const router = useRouter();
  const [components, setComponents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => {
    if (!embedded) {
      router.replace('/owner/hr?tab=rules');
    }
  }, [embedded, router]);
  
  // Create / Edit Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('EARNING');
  const [amountType, setAmountType] = useState('FIXED');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [percentage, setPercentage] = useState('');
  const [isTaxApplicable, setIsTaxApplicable] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const res = await hrService.getAllComponents();
      setComponents(res.data || []);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingComponent(null);
    setName('');
    setType('EARNING');
    setAmountType('FIXED');
    setDefaultAmount('');
    setPercentage('');
    setIsTaxApplicable(false);
    setShowModal(true);
  };

  const handleOpenEdit = (comp) => {
    setEditingComponent(comp);
    setName(comp.name || '');
    setType(comp.type || 'EARNING');
    setAmountType(comp.amountType || 'FIXED');
    setDefaultAmount(comp.defaultAmount !== undefined && comp.defaultAmount !== null ? comp.defaultAmount : '');
    setPercentage(comp.percentage !== undefined && comp.percentage !== null ? comp.percentage : '');
    setIsTaxApplicable(!!comp.isTaxApplicable);
    setShowModal(true);
  };

  const handleSaveComponent = async (e) => {
    e.preventDefault();
    if (!name) return;
    
    const payload = {
      name,
      type,
      amountType,
      defaultAmount: amountType === 'FIXED' ? parseFloat(defaultAmount) : null,
      percentage: amountType === 'PERCENTAGE' ? parseFloat(percentage) : null,
      isTaxApplicable,
      isActive: editingComponent ? editingComponent.isActive : true
    };

    try {
      if (editingComponent) {
        await hrService.updateComponent(editingComponent.id, payload);
      } else {
        await hrService.createComponent(payload);
      }
      setShowModal(false);
      setEditingComponent(null);
      fetchData();
    } catch (error) {
      console.error("Error saving component", error);
      const msg = error.response?.data?.message || error.message || "Failed to save salary rule.";
      setConfirmModal({
        title: 'Error Saving Rule',
        message: msg,
        type: 'error',
        confirmText: 'OK',
        confirmVariant: 'primary',
        showCancel: false,
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const handleToggleStatus = async (comp) => {
    const currentActiveStatus = comp.isActive !== undefined ? comp.isActive : (comp.active !== undefined ? comp.active : false);
    const nextStatus = !currentActiveStatus;
    try {
      await hrService.updateComponent(comp.id, {
        ...comp,
        isActive: nextStatus,
        active: nextStatus
      });
      fetchData();
    } catch (error) {
      console.error("Error toggling status", error);
    }
  };

  const handleDeleteComponent = (comp) => {
    setConfirmModal({
      title: 'Delete Salary Rule',
      message: `Are you sure you want to delete rule "${comp.name}"?`,
      type: 'confirm',
      confirmText: 'Delete Rule',
      confirmVariant: 'danger',
      showCancel: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await hrService.deleteComponent(comp.id);
          fetchData();
        } catch (error) {
          console.error("Error deleting component", error);
          const errorMsg = error.response?.data?.message || error.message || 'Failed to delete salary component.';
          setConfirmModal({
            title: 'Cannot Delete Rule',
            message: errorMsg,
            type: 'error',
            confirmText: 'Got It',
            confirmVariant: 'primary',
            showCancel: false,
            onConfirm: () => setConfirmModal(null)
          });
        }
      }
    });
  };

  return (
    <DashboardLayout title="Salary Rules Engine" subtitle="Configure earnings, deductions, taxes, and bonuses." bare={embedded}>
      <Head>
        <title>Salary Rules | Cafe QR</title>
      </Head>

      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={handleOpenCreate}>
          <FaPlus /> New Component
        </button>
      </div>

      <div className="table-container glass-panel">
        {isLoading ? (
          <div className="loading-state">Loading components...</div>
        ) : (
          <table className="modern-table">
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Category</th>
                <th>Calculation Type</th>
                <th>Default Value</th>
                <th>Taxable?</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {components.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">No salary components defined.</td>
                </tr>
              ) : (
                components.map(comp => {
                  const isCompActive = comp.isActive !== undefined ? comp.isActive : (comp.active !== undefined ? comp.active : false);
                  return (
                    <tr key={comp.id}>
                      <td className="font-bold flex items-center gap-3">
                        <div className={`icon-box ${comp.type.toLowerCase()}`}><FaCogs /></div>
                        {comp.name}
                      </td>
                      <td><span className={`type-badge ${comp.type.toLowerCase()}`}>{comp.type}</span></td>
                      <td>
                        <span className={`calc-badge ${comp.amountType === 'PERCENTAGE' ? 'percentage' : 'calc-fixed'}`}>
                          {comp.amountType || 'FIXED'}
                        </span>
                      </td>
                      <td className="font-bold">
                        {comp.amountType === 'FIXED' || !comp.amountType ? `$${comp.defaultAmount?.toFixed(2) || '0.00'}` : `${comp.percentage}% of Gross`}
                      </td>
                      <td>
                        <span className={`tax-badge ${(comp.isTaxApplicable || comp.taxApplicable || comp.taxable) ? 'yes' : 'no'}`}>
                          {(comp.isTaxApplicable || comp.taxApplicable || comp.taxable) ? "Taxable" : "Non-Taxable"}
                        </span>
                      </td>
                      <td>
                        <span 
                          className={isCompActive ? "status-badge approved cursor-pointer" : "status-badge rejected cursor-pointer"}
                          onClick={() => handleToggleStatus(comp)}
                          title="Click to toggle Active / Inactive status"
                          style={{ cursor: 'pointer' }}
                        >
                          {isCompActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                          <button className="icon-btn edit" onClick={() => handleOpenEdit(comp)} title="Edit Rule"><FaEdit /></button>
                          <button className="icon-btn delete" onClick={() => handleDeleteComponent(comp)} title="Delete Rule"><FaTrash /></button>
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

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3>{editingComponent ? 'Edit Salary Rule' : 'Create Salary Rule'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group mb-4">
                <label>Rule Name (e.g., "Health Insurance")</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="flex gap-4 mb-4">
                <div className="form-group flex-1">
                  <label>Category</label>
                  <select value={type} onChange={e => setType(e.target.value)}>
                    <option value="EARNING">Earning / Bonus</option>
                    <option value="DEDUCTION">Deduction / Tax</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Calculation Type</label>
                  <select value={amountType} onChange={e => setAmountType(e.target.value)}>
                    <option value="FIXED">Fixed Amount</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>
              </div>
              
              {amountType === 'FIXED' ? (
                <div className="form-group mb-4">
                  <label>Fixed Amount ($)</label>
                  <input type="number" step="0.01" value={defaultAmount} onChange={e => setDefaultAmount(e.target.value)} required />
                </div>
              ) : (
                <div className="form-group mb-4">
                  <label>Percentage (% of Gross Pay)</label>
                  <input type="number" step="0.01" value={percentage} onChange={e => setPercentage(e.target.value)} required />
                </div>
              )}

              <div className="form-group mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="taxCheck" checked={isTaxApplicable} onChange={e => setIsTaxApplicable(e.target.checked)} />
                <label htmlFor="taxCheck">Tax Applicable</label>
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <HrConfirmModal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        {...confirmModal}
      />

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
        
        .icon-box { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
        .icon-box.earning { background: #dcfce7; color: #15803d; }
        .icon-box.deduction { background: #fee2e2; color: #b91c1c; }

        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .status-badge.approved { background: #dcfce7; color: #15803d; }
        .status-badge.rejected { background: #fee2e2; color: #b91c1c; }

        .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
        .type-badge.earning { background: #e0e7ff; color: #4338ca; }
        .type-badge.deduction { background: #ffedd5; color: #c2410c; }

        .calc-badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; white-space: nowrap; }
        .calc-badge.calc-fixed { background: #f3f4f6; color: #4b5563; }
        .calc-badge.percentage { background: #fef3c7; color: #d97706; }

        .tax-badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .tax-badge.yes { background: #e0f2fe; color: #0369a1; }
        .tax-badge.no { background: #f1f5f9; color: #64748b; }

        .btn-primary { display: flex; gap: 8px; align-items: center; padding: 10px 20px; border-radius: 12px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; font-weight: 600; border: none; cursor: pointer; }
        .btn-secondary { padding: 10px 20px; border-radius: 12px; background: #f1f5f9; color: #475569; font-weight: 600; border: none; cursor: pointer; }
        
        .icon-btn { width: 32px; height: 32px; border-radius: 8px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .icon-btn.edit { background: #e0e7ff; color: #4338ca; }
        .icon-btn.delete { background: #fee2e2; color: #b91c1c; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal-content { width: 100%; max-width: 500px; padding: 32px; background: white; border-radius: 20px; }
        .modal-content h3 { margin: 0 0 24px; font-size: 20px; }
        
        .form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: #475569; }
        .form-group input, .form-group select { 
          width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #cbd5e1; 
          outline: none; color: #1e293b; background: #f8fafc; font-size: 14px;
        }
        .form-group input:focus, .form-group select:focus {
          border-color: #f97316; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); background: #fff;
        }
      `}</style>
    </DashboardLayout>
  );
}
