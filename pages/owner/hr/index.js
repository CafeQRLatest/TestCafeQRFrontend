import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../components/DashboardLayout';
import ModuleGate from '../../../components/ModuleGate';
import EmployeeMaster from './employees/index';
import TimesheetsDashboard from './timesheets/index';
import LeaveManagement from './leaves/index';
import SalaryAdvancesDashboard from './advances/index';
import SalaryRulesDashboard from './components/index';
import HrSettingsDashboard from './settings/index';
import RunPayrollDashboard from './payroll/index';
import { FaUsers, FaClock, FaCalendarAlt, FaMoneyBillWave, FaCogs, FaSlidersH, FaMoneyCheckAlt } from 'react-icons/fa';

const TABS = [
  { key: 'employees', label: 'Employees', icon: <FaUsers /> },
  { key: 'timesheets', label: 'Timesheets & Overrides', icon: <FaClock /> },
  { key: 'leaves', label: 'Leave Approvals', icon: <FaCalendarAlt /> },
  { key: 'advances', label: 'Salary Advances', icon: <FaMoneyBillWave /> },
  { key: 'rules', label: 'Salary Rules', icon: <FaCogs /> },
  { key: 'settings', label: 'HR Policy Settings', icon: <FaSlidersH /> },
  { key: 'payroll', label: 'Run Payroll', icon: <FaMoneyCheckAlt /> },
];

export default function UnifiedHrHub() {
  return (
    <ModuleGate>
      <UnifiedHrContent />
    </ModuleGate>
  );
}

function UnifiedHrContent() {
  const router = useRouter();
  const { tab } = router.query;
  const [activeTab, setActiveTab] = useState('employees');

  useEffect(() => {
    if (tab && TABS.some(t => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [tab]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    router.push({ pathname: '/owner/hr', query: { tab: key } }, undefined, { shallow: true });
  };

  const activeTabObj = TABS.find(t => t.key === activeTab) || TABS[0];

  return (
    <DashboardLayout 
      title="HR & Payroll Management" 
      subtitle={`Unified management hub for staff, attendance, leaves, payroll rules, and policy settings (${activeTabObj.label})`}
    >
      <Head>
        <title>{activeTabObj.label} | HR & Payroll | Cafe QR</title>
      </Head>

      <div className="unified-hr-wrapper">
        {/* Top Segmented Control Tabs */}
        <div className="segmented-tabs-wrapper glass-panel">
          <div className="segmented-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                className={`segmented-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => handleTabChange(t.key)}
              >
                <span className="tab-icon">{t.icon}</span>
                <span className="tab-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content View */}
        <div className="tab-view-content">
          {activeTab === 'employees' && <EmployeeMaster embedded={true} />}
          {activeTab === 'timesheets' && <TimesheetsDashboard embedded={true} />}
          {activeTab === 'leaves' && <LeaveManagement embedded={true} />}
          {activeTab === 'advances' && <SalaryAdvancesDashboard embedded={true} />}
          {activeTab === 'rules' && <SalaryRulesDashboard embedded={true} />}
          {activeTab === 'settings' && <HrSettingsDashboard embedded={true} />}
          {activeTab === 'payroll' && <RunPayrollDashboard embedded={true} />}
        </div>
      </div>

      <style jsx>{`
        .unified-hr-wrapper {
          display: flex; flex-direction: column; gap: 20px;
          animation: fadeIn 0.3s ease-out;
        }

        .glass-panel {
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .segmented-tabs-wrapper {
          padding: 8px; overflow-x: auto;
        }

        .segmented-tabs {
          display: flex; gap: 6px; flex-wrap: nowrap; min-width: max-content;
        }

        .segmented-tab {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 12px; border: none;
          background: transparent; color: #475569; font-weight: 600;
          font-size: 13.5px; cursor: pointer; transition: all 0.2s ease;
          white-space: nowrap;
        }

        .segmented-tab .tab-icon {
          display: flex; align-items: center; font-size: 15px; color: #64748b;
          transition: color 0.2s;
        }

        .segmented-tab:hover {
          background: rgba(241, 245, 249, 0.8); color: #1e293b;
        }

        .segmented-tab.active {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white; font-weight: 700;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
        }

        .segmented-tab.active .tab-icon {
          color: white;
        }

        .tab-view-content {
          margin-top: 4px;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </DashboardLayout>
  );
}
