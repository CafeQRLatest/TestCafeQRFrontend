import React, { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaUser, FaEnvelope, FaPhone, FaMoneyBillWave, FaBuilding } from 'react-icons/fa';

export default function EmployeeCreationModal({ isOpen, onClose, onSave, employeeToEdit = null, departments = [], designations = [] }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    departmentId: '',
    designationId: '',
    employmentType: 'FULL_TIME',
    baseSalary: '',
    hourlyRate: '',
    bankAccountNumber: '',
    bankRoutingNumber: '',
    taxId: '',
    nationalId: '',
    isActive: true
  });

  useEffect(() => {
    if (employeeToEdit) {
      setFormData({
        firstName: employeeToEdit.firstName || '',
        lastName: employeeToEdit.lastName || '',
        email: employeeToEdit.email || '',
        phone: employeeToEdit.phoneNumber || employeeToEdit.phone || '',
        departmentId: employeeToEdit.department ? employeeToEdit.department.id : (employeeToEdit.departmentId || ''),
        designationId: employeeToEdit.designation ? employeeToEdit.designation.id : (employeeToEdit.designationId || ''),
        employmentType: employeeToEdit.employmentType || 'FULL_TIME',
        baseSalary: employeeToEdit.baseSalary !== undefined && employeeToEdit.baseSalary !== null ? employeeToEdit.baseSalary : '',
        hourlyRate: employeeToEdit.hourlyRate !== undefined && employeeToEdit.hourlyRate !== null ? employeeToEdit.hourlyRate : '',
        bankAccountNumber: employeeToEdit.bankAccountNumber || '',
        bankRoutingNumber: employeeToEdit.bankRoutingNumber || '',
        taxId: employeeToEdit.taxId || '',
        nationalId: employeeToEdit.nationalId || '',
        pinCode: employeeToEdit.pinCode || '',
        isActive: employeeToEdit.isActive !== undefined ? employeeToEdit.isActive : true
      });
    } else {
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        departmentId: '',
        designationId: '',
        employmentType: 'FULL_TIME',
 baseSalary: '',
        hourlyRate: '',
        bankAccountNumber: '',
        bankRoutingNumber: '',
        taxId: '',
        nationalId: '',
        pinCode: '',
        isActive: true
      });
    }
  }, [employeeToEdit, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Clean up empty strings to null for UUID fields so backend doesn't crash
    const payload = { ...formData };
    if (!payload.departmentId) payload.departmentId = null;
    if (!payload.designationId) payload.designationId = null;
    
    onSave(payload);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container glass-panel">
        <div className="modal-header">
          <h2>{employeeToEdit ? 'Edit Employee' : 'Create New Employee'}</h2>
          <button className="close-btn" onClick={onClose}><FaTimes /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label><FaUser className="input-icon" /> First Name</label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label><FaUser className="input-icon" /> Last Name</label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label><FaEnvelope className="input-icon" /> Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label><FaPhone className="input-icon" /> Phone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            
            <div className="form-group">
              <label><FaBuilding className="input-icon" /> Department</label>
              <select name="departmentId" value={formData.departmentId} onChange={handleChange}>
                <option value="">Select Department...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label><FaBuilding className="input-icon" /> Designation</label>
              <select name="designationId" value={formData.designationId} onChange={handleChange}>
                <option value="">Select Designation...</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.name || d.title}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Employment Type</label>
              <select name="employmentType" value={formData.employmentType} onChange={handleChange}>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="HOURLY">Hourly (Shift-based)</option>
              </select>
            </div>

            {formData.employmentType === 'HOURLY' ? (
              <div className="form-group highlight-field">
                <label><FaMoneyBillWave className="input-icon" /> Hourly Rate ($)</label>
                <input type="number" step="0.01" name="hourlyRate" value={formData.hourlyRate} onChange={handleChange} required />
              </div>
            ) : (
              <div className="form-group highlight-field">
                <label><FaMoneyBillWave className="input-icon" /> Base Salary (Monthly)</label>
                <input type="number" step="0.01" name="baseSalary" value={formData.baseSalary} onChange={handleChange} required />
              </div>
            )}
            
            <div className="form-group">
              <label>Bank Account Number</label>
              <input type="text" name="bankAccountNumber" value={formData.bankAccountNumber} onChange={handleChange} />
            </div>
            
            <div className="form-group">
              <label>Bank Routing Number</label>
              <input type="text" name="bankRoutingNumber" value={formData.bankRoutingNumber} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label>Tax ID (e.g. SSN / PAN)</label>
              <input type="text" name="taxId" value={formData.taxId} onChange={handleChange} />
            </div>
            
            <div className="form-group">
              <label>National ID / Passport</label>
              <input type="text" name="nationalId" value={formData.nationalId} onChange={handleChange} />
            </div>

            <div className="form-group highlight-field">
              <label>Kiosk 4-Digit PIN</label>
              <input 
                type="password" 
                maxLength="4" 
                name="pinCode" 
                placeholder="e.g. 1234" 
                value={formData.pinCode} 
                onChange={handleChange} 
              />
            </div>
          </div>
          
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary"><FaSave /> Save Employee</button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center;
          z-index: 9999; animation: fadeIn 0.2s ease-out;
        }
        .glass-panel {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .modal-container {
          width: 95%; max-width: 600px; border-radius: 24px;
          margin: 20px; max-height: 90vh; overflow-y: auto;
          display: flex; flex-direction: column;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .modal-header {
          padding: 24px 32px; display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid rgba(226, 232, 240, 0.8);
          background: linear-gradient(to right, #f8fafc, #ffffff);
        }
        .modal-header h2 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
        .close-btn {
          width: 36px; height: 36px; border-radius: 12px; border: none;
          background: #f1f5f9; color: #64748b; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .close-btn:hover { background: #fee2e2; color: #ef4444; transform: rotate(90deg); }
        
        .modal-body { padding: 32px; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px; }
        .input-icon { color: #f97316; }
        
        input, select {
          padding: 12px 16px; border-radius: 12px; border: 1px solid #cbd5e1;
          background: #f8fafc; font-size: 14px; color: #1e293b; width: 100%;
          transition: all 0.2s; outline: none;
        }
        input:focus, select:focus {
          border-color: #f97316; background: #fff;
          box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1);
        }
        
        .highlight-field input { border-color: #fbd38d; background: #fffaf0; }
        .highlight-field input:focus { border-color: #f97316; }

        .modal-footer {
          margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;
          display: flex; justify-content: flex-end; gap: 12px;
        }
        
        .btn-secondary {
          padding: 12px 24px; border-radius: 12px; border: 1px solid #cbd5e1;
          background: white; color: #475569; font-weight: 700; cursor: pointer;
        }
        .btn-secondary:hover { background: #f1f5f9; }
        
        .btn-primary {
          padding: 12px 24px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; gap: 8px;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
          transition: transform 0.2s;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(249, 115, 22, 0.4); }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
