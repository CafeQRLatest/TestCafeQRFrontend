import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import DashboardLayout from '../../../../components/DashboardLayout';
import { hrService } from '../../../../services/hrService';
import EmployeeCreationModal from '../../../../components/hr/EmployeeCreationModal';
import DepartmentModal from '../../../../components/hr/DepartmentModal';
import DesignationModal from '../../../../components/hr/DesignationModal';
import { FaPlus, FaSearch, FaUserTie, FaEdit, FaTrash } from 'react-icons/fa';

export default function EmployeeMaster() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [editingEmployee, setEditingEmployee] = useState(null);
  
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isDesigModalOpen, setIsDesigModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [empRes, depRes, desRes] = await Promise.all([
        hrService.getAllEmployees(),
        hrService.getAllDepartments(),
        hrService.getAllDesignations()
      ]);
      setEmployees(empRes.data || []);
      setDepartments(depRes.data || []);
      setDesignations(desRes.data || []);
    } catch (error) {
      console.error('Failed to fetch HR data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingEmployee(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp) => {
    setEditingEmployee(emp);
    setIsModalOpen(true);
  };

  const handleSaveEmployee = async (formData) => {
    try {
      if (editingEmployee) {
        await hrService.updateEmployee(editingEmployee.id, formData);
      } else {
        await hrService.createEmployee(formData);
      }
      setIsModalOpen(false);
      setEditingEmployee(null);
      fetchData(); // Refresh list
    } catch (error) {
      console.error('Failed to save employee:', error);
      alert('Failed to save employee: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleToggleStatus = async (emp) => {
    try {
      await hrService.updateEmployee(emp.id, {
        ...emp,
        isActive: !emp.isActive
      });
      fetchData();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!confirm("Are you sure you want to delete this employee?")) return;
    try {
      await hrService.deleteEmployee(id);
      fetchData();
    } catch (error) {
      console.error('Failed to delete employee:', error);
      alert('Failed to delete employee: ' + (error.response?.data?.message || error.message));
    }
  };

  const filteredEmployees = employees.filter(e => 
    (e.firstName + ' ' + e.lastName).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout title="Employee Master" subtitle="Manage your staff, payroll details, and access." showBack={false}>
      <Head>
        <title>Payroll & HR | Cafe QR</title>
      </Head>

      <div className="hr-dashboard">
        
        {/* Header Action Bar */}
        <div className="action-bar glass-panel">
          <div className="search-box">
            <FaSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Search employees by name or email..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="action-buttons-group" style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={() => setIsDeptModalOpen(true)}>
              Departments
            </button>
            <button className="btn-secondary" onClick={() => setIsDesigModalOpen(true)}>
              Designations
            </button>
            <button className="btn-primary" onClick={handleOpenCreate}>
              <FaPlus /> Add Employee
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="stats-grid">
          <div className="stat-card glass-panel">
            <div className="stat-icon" style={{background: '#e0e7ff', color: '#4f46e5'}}><FaUserTie /></div>
            <div className="stat-info">
              <h3>Total Employees</h3>
              <p>{employees.length}</p>
            </div>
          </div>
          <div className="stat-card glass-panel">
            <div className="stat-icon" style={{background: '#dcfce7', color: '#16a34a'}}><FaUserTie /></div>
            <div className="stat-info">
              <h3>Active Staff</h3>
              <p>{employees.filter(e => e.isActive).length}</p>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="table-container glass-panel">
          {isLoading ? (
            <div className="loading-state">Loading employee data...</div>
          ) : (
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Contact</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th>Pay Rate</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No employees found.</td>
                  </tr>
                ) : (
                  filteredEmployees.map(emp => (
                    <tr key={emp.id}>
                      <td>
                        <div className="emp-name-cell">
                          <div className="emp-avatar">{emp.firstName.charAt(0)}{emp.lastName.charAt(0)}</div>
                          <div>
                            <div className="emp-name">{emp.firstName} {emp.lastName}</div>
                            <div className="emp-id">ID: {emp.id.substring(0,8).toUpperCase()}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact-info">
                          <span>{emp.email || 'N/A'}</span>
                          <span className="phone">{emp.phone || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        {emp.department ? emp.department.name : (emp.departmentName || 'N/A')}
                        <div className="designation">{(emp.designation ? (emp.designation.name || emp.designation.title) : emp.designationName) || ''}</div>
                      </td>
                      <td>
                        <span className={`badge type-${emp.employmentType.toLowerCase()}`}>
                          {emp.employmentType.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {emp.employmentType === 'HOURLY' 
                          ? `$${emp.hourlyRate}/hr` 
                          : `$${emp.baseSalary}/mo`}
                      </td>
                      <td>
                        <span 
                          className={`badge status-${emp.isActive ? 'active' : 'inactive'} cursor-pointer`}
                          onClick={() => handleToggleStatus(emp)}
                          title="Click to toggle Active / Inactive status"
                          style={{ cursor: 'pointer' }}
                        >
                          {emp.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="icon-btn edit" onClick={() => handleOpenEdit(emp)} title="Edit Employee"><FaEdit /></button>
                          <button className="icon-btn delete" onClick={() => handleDeleteEmployee(emp.id)} title="Delete Employee"><FaTrash /></button>
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

      <EmployeeCreationModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingEmployee(null); }}
        onSave={handleSaveEmployee}
        employeeToEdit={editingEmployee}
        departments={departments}
        designations={designations}
      />

      <DepartmentModal 
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        departments={departments}
        onRefresh={fetchData}
      />

      <DesignationModal 
        isOpen={isDesigModalOpen}
        onClose={() => setIsDesigModalOpen(false)}
        designations={designations}
        onRefresh={fetchData}
      />

      <style jsx>{`
        .hr-dashboard {
          display: flex; flex-direction: column; gap: 24px;
          animation: slideUp 0.4s ease-out;
        }

        .glass-panel {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
        }

        .action-bar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 24px; gap: 16px; flex-wrap: wrap;
        }

        .search-box {
          position: relative; flex: 1; max-width: 400px;
        }
        .search-icon {
          position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
          color: #94a3b8;
        }
        .search-box input {
          width: 100%; padding: 12px 16px 12px 42px;
          border-radius: 12px; border: 1px solid #e2e8f0;
          background: white; color: #1e293b; outline: none; transition: all 0.2s;
        }
        .search-box input:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }

        .btn-secondary {
          padding: 12px 20px; border-radius: 12px; border: 1px solid #cbd5e1;
          background: white; color: #475569; font-weight: 700; cursor: pointer;
          transition: background 0.2s;
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

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
        .stat-card {
          padding: 24px; display: flex; align-items: center; gap: 16px;
        }
        .stat-icon {
          width: 48px; height: 48px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center; font-size: 20px;
        }
        .stat-info h3 { margin: 0 0 4px; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; }
        .stat-info p { margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; }

        .table-container { overflow-x: auto; }
        .modern-table { width: 100%; border-collapse: collapse; text-align: left; }
        .modern-table th {
          padding: 16px 24px; font-size: 12px; font-weight: 700; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.05em;
          border-bottom: 1px solid #e2e8f0; background: rgba(248, 250, 252, 0.5);
        }
        .modern-table td {
          padding: 16px 24px; border-bottom: 1px solid #f1f5f9; vertical-align: middle;
        }
        .modern-table tbody tr:hover { background: rgba(248, 250, 252, 0.8); }
        
        .emp-name-cell { display: flex; align-items: center; gap: 12px; }
        .emp-avatar {
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 14px;
        }
        .emp-name { font-weight: 700; color: #1e293b; }
        .emp-id { font-size: 11px; color: #94a3b8; margin-top: 2px; }

        .contact-info { display: flex; flex-direction: column; font-size: 13px; color: #475569; }
        .contact-info .phone { font-size: 12px; color: #94a3b8; margin-top: 2px; }

        .designation { font-size: 12px; color: #94a3b8; margin-top: 2px; }

        .badge {
          padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
        }
        .type-full_time { background: #dbeafe; color: #1d4ed8; }
        .type-part_time { background: #fef3c7; color: #b45309; }
        .type-hourly { background: #f3e8ff; color: #7e22ce; }
        
        .status-active { background: #dcfce7; color: #15803d; }
        .status-inactive { background: #fee2e2; color: #b91c1c; }

        .action-buttons { display: flex; gap: 8px; }
        .icon-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s;
        }
        .icon-btn.edit { background: #f1f5f9; color: #3b82f6; }
        .icon-btn.edit:hover { background: #dbeafe; }
        .icon-btn.delete { background: #fef2f2; color: #ef4444; }
        .icon-btn.delete:hover { background: #fee2e2; }

        .empty-state { text-align: center; padding: 40px !important; color: #64748b; font-weight: 600; }
        .loading-state { text-align: center; padding: 40px; color: #64748b; font-weight: 600; }

        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </DashboardLayout>
  );
}
