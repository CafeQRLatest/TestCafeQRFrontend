import React, { useState, useEffect } from 'react';
import { hrService } from '../../services/hrService';
import { FaTimes, FaSave, FaTrash, FaCheck, FaPlus } from 'react-icons/fa';

export default function EmployeeSalaryRulesModal({ isOpen, onClose, employee }) {
  const [allComponents, setAllComponents] = useState([]);
  const [employeeComponents, setEmployeeComponents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState('');
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overridePercentage, setOverridePercentage] = useState('');

  useEffect(() => {
    if (isOpen && employee) {
      loadData();
    }
  }, [isOpen, employee]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [compRes, empCompRes] = await Promise.all([
        hrService.getAllComponents(),
        hrService.getEmployeeSalaryComponents(employee.id)
      ]);
      setAllComponents(compRes.data || []);
      setEmployeeComponents(empCompRes.data || []);
    } catch (error) {
      console.error('Error loading employee salary rules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !employee) return null;

  const handleAssignComponent = async () => {
    if (!selectedComponentId) return;
    try {
      setIsSaving(true);
      const comp = allComponents.find(c => c.id === selectedComponentId);
      const dto = {
        salaryComponentId: selectedComponentId,
        overrideAmount: overrideAmount !== '' ? parseFloat(overrideAmount) : null,
        overridePercentage: overridePercentage !== '' ? parseFloat(overridePercentage) : null,
        isActive: true
      };
      await hrService.assignEmployeeSalaryComponent(employee.id, dto);
      setSelectedComponentId('');
      setOverrideAmount('');
      setOverridePercentage('');
      await loadData();
    } catch (error) {
      console.error('Failed to assign component:', error);
      alert('Failed to assign component: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveComponent = async (salaryComponentId) => {
    if (!confirm('Remove this custom rule for the employee?')) return;
    try {
      await hrService.removeEmployeeSalaryComponent(employee.id, salaryComponentId);
      await loadData();
    } catch (error) {
      console.error('Failed to remove component:', error);
    }
  };

  const assignedIds = employeeComponents.map(c => c.salaryComponentId);
  const availableComponents = allComponents.filter(c => !assignedIds.includes(c.id));

  return (
    <div className="modal-overlay">
      <div className="modal-container glass-panel">
        <div className="modal-header">
          <div>
            <h2>Salary Components for {employee.firstName} {employee.lastName}</h2>
            <p className="subtitle">Assign allowances, bonuses, tax, and custom deductions for this employee</p>
          </div>
          <button className="close-btn" onClick={onClose}><FaTimes /></button>
        </div>

        <div className="modal-body">
          {isLoading ? (
            <div className="loading-state">Loading salary rules...</div>
          ) : (
            <>
              {/* Add New Rule Section */}
              <div className="add-rule-card">
                <h3>Assign New Rule / Allowance / Deduction</h3>
                <div className="add-rule-form">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Select Global Salary Rule</label>
                    <select
                      value={selectedComponentId}
                      onChange={(e) => setSelectedComponentId(e.target.value)}
                    >
                      <option value="">-- Choose Component --</option>
                      {availableComponents.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type}) - Default: {c.amountType === 'PERCENTAGE' ? `${c.percentage}%` : `$${c.defaultAmount}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Override Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Optional"
                      value={overrideAmount}
                      onChange={(e) => setOverrideAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Override %</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Optional"
                      value={overridePercentage}
                      onChange={(e) => setOverridePercentage(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                    <button
                      className="btn-add"
                      onClick={handleAssignComponent}
                      disabled={!selectedComponentId || isSaving}
                    >
                      <FaPlus /> Assign Rule
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Rules List */}
              <div className="rules-list-section">
                <h3>Active Assigned Rules</h3>
                {employeeComponents.length === 0 ? (
                  <div className="empty-rules">No custom rules assigned. Standard global rules apply during payroll calculation.</div>
                ) : (
                  <div className="rules-grid">
                    {employeeComponents.map(item => (
                      <div key={item.id} className={`rule-card ${item.componentType === 'EARNING' ? 'earning' : 'deduction'}`}>
                        <div className="rule-info">
                          <span className={`badge-type ${item.componentType === 'EARNING' ? 'earning' : 'deduction'}`}>
                            {item.componentType}
                          </span>
                          <div className="rule-name">{item.componentName}</div>
                          <div className="rule-details">
                            {item.overrideAmount != null ? (
                              <span className="override">Override: ${item.overrideAmount}</span>
                            ) : item.overridePercentage != null ? (
                              <span className="override">Override: {item.overridePercentage}%</span>
                            ) : (
                              <span>Standard: {item.amountType === 'PERCENTAGE' ? `${item.percentage}%` : `$${item.defaultAmount}`}</span>
                            )}
                          </div>
                        </div>
                        <button
                          className="icon-btn delete"
                          onClick={() => handleRemoveComponent(item.salaryComponentId)}
                          title="Remove Rule"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1100; padding: 20px;
        }

        .modal-container {
          width: 100%; max-width: 750px; max-height: 90vh;
          background: white; border-radius: 20px;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .modal-header {
          padding: 24px; border-bottom: 1px solid #e2e8f0;
          display: flex; justify-content: space-between; align-items: flex-start;
          background: #f8fafc;
        }
        .modal-header h2 { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; }
        .subtitle { margin: 4px 0 0; font-size: 13px; color: #64748b; }
        .close-btn { background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; }
        .close-btn:hover { color: #0f172a; }

        .modal-body { padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }

        .add-rule-card {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;
        }
        .add-rule-card h3 { margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #334155; }

        .add-rule-form { display: flex; gap: 12px; flex-wrap: wrap; }
        .form-group { display: flex; flex-direction: column; gap: 4px; }
        .form-group label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .form-group input, .form-group select {
          padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1;
          font-size: 13px; outline: none; background: white; color: #1e293b;
        }
        .form-group input::placeholder { color: #94a3b8; opacity: 1; }
        .btn-add {
          padding: 10px 16px; border-radius: 8px; border: none;
          background: #f97316; color: white; font-weight: 700; font-size: 13px;
          cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }
        .btn-add:disabled { opacity: 0.5; cursor: not-allowed; }

        .rules-list-section h3 { margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #334155; }
        .empty-rules { padding: 20px; text-align: center; color: #94a3b8; font-size: 13px; background: #f8fafc; border-radius: 12px; }

        .rules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
        .rule-card {
          padding: 14px; border-radius: 12px; border: 1px solid #e2e8f0; background: white;
          display: flex; justify-content: space-between; align-items: center;
        }
        .rule-card.earning { border-left: 4px solid #10b981; }
        .rule-card.deduction { border-left: 4px solid #ef4444; }

        .badge-type {
          font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;
        }
        .badge-type.earning { background: #d1fae5; color: #047857; }
        .badge-type.deduction { background: #fee2e2; color: #b91c1c; }

        .rule-name { font-weight: 700; font-size: 14px; color: #1e293b; margin-top: 4px; }
        .rule-details { font-size: 12px; color: #64748b; margin-top: 2px; }
        .override { color: #f97316; font-weight: 700; }

        .icon-btn.delete {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          background: #fee2e2; color: #ef4444; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .icon-btn.delete:hover { background: #fca5a5; }

        .modal-footer {
          padding: 16px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc;
          display: flex; justify-content: flex-end;
        }
        .btn-secondary {
          padding: 10px 20px; border-radius: 10px; border: 1px solid #cbd5e1;
          background: white; color: #475569; font-weight: 700; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
