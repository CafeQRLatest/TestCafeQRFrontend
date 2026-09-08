import api from '../utils/api';

export const hrService = {
  // ---- Employees ----
  getAllEmployees: async () => {
    return await api.get('/api/v1/hr/employees');
  },
  
  getEmployeeById: async (id) => {
    return await api.get(`/api/v1/hr/employees/${id}`);
  },

  createEmployee: async (data) => {
    return await api.post('/api/v1/hr/employees', data);
  },

  updateEmployee: async (id, data) => {
    return await api.put(`/api/v1/hr/employees/${id}`, data);
  },

  deleteEmployee: async (id) => {
    return await api.delete(`/api/v1/hr/employees/${id}`);
  },

  // ---- Departments ----
  getAllDepartments: async () => {
    return await api.get('/api/v1/hr/departments');
  },
  
  createDepartment: async (data) => {
    return await api.post('/api/v1/hr/departments', data);
  },

  // ---- Designations ----
  getAllDesignations: async () => {
    return await api.get('/api/v1/hr/designations');
  },
  
  createDesignation: async (data) => {
    return await api.post('/api/v1/hr/designations', data);
  },

  // ---- Attendance ----
  getAllAttendance: async (startDate, endDate) => {
    let url = '/api/v1/hr/attendance';
    const params = [];
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return await api.get(url);
  },

  clockIn: async (data) => {
    // data: { employeeId, punchMethod: "PIN" | "FACE_SCAN" }
    return await api.post('/api/v1/hr/attendance/clock-in', data);
  },

  clockOut: async (data) => {
    return await api.post('/api/v1/hr/attendance/clock-out', data);
  },

  createManualAttendance: async (data) => {
    return await api.post('/api/v1/hr/attendance/manual', data);
  },

  updateAttendance: async (id, data) => {
    return await api.put(`/api/v1/hr/attendance/${id}`, data);
  },

  deleteAttendance: async (id) => {
    return await api.delete(`/api/v1/hr/attendance/${id}`);
  },

  // ---- HR Policy & Overtime Settings ----
  getHrSettings: async () => {
    return await api.get('/api/v1/hr/settings');
  },

  updateHrSettings: async (data) => {
    return await api.put('/api/v1/hr/settings', data);
  },

  // ---- Payroll Engine ----
  initiatePayrollRun: async (data) => {
    // data: { name: "Sep 2026", startDate, endDate }
    return await api.post('/api/v1/hr/payroll/run', data);
  },

  getAllPayrollRuns: async () => {
    return await api.get('/api/v1/hr/payroll/runs');
  },

  getSlipsForRun: async (runId) => {
    return await api.get(`/api/v1/hr/payroll/runs/${runId}/slips`);
  },
  
  // ---- Accounting Export ----
  downloadAchExport: (runId) => {
    // Return the URL for direct download or fetch blob
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/hr/payroll-export/ach/${runId}`;
  },

  syncToAccounting: async (runId) => {
    return await api.post(`/api/v1/hr/payroll-accounting/sync/${runId}`);
  },

  // ---- Leaves ----
  getAllLeaveRequests: async () => {
    return await api.get('/api/v1/hr/leaves');
  },
  
  createLeaveRequest: async (data) => {
    return await api.post('/api/v1/hr/leaves', data);
  },

  updateLeaveStatus: async (id, status) => {
    return await api.put(`/api/v1/hr/leaves/${id}/status?status=${status}`);
  },

  // ---- Salary Advances ----
  getAllAdvances: async () => {
    return await api.get('/api/v1/hr/advances');
  },

  createAdvance: async (data) => {
    return await api.post('/api/v1/hr/advances', data);
  },

  updateAdvanceStatus: async (id, status) => {
    return await api.put(`/api/v1/hr/advances/${id}/status?status=${status}`);
  },

  // ---- Salary Components ----
  getAllComponents: async () => {
    return await api.get('/api/v1/hr/salary-components');
  },

  createComponent: async (data) => {
    return await api.post('/api/v1/hr/salary-components', data);
  },

  updateComponent: async (id, data) => {
    return await api.put(`/api/v1/hr/salary-components/${id}`, data);
  },

  deleteComponent: async (id) => {
    return await api.delete(`/api/v1/hr/salary-components/${id}`);
  }
};
