import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { FaBuilding, FaExclamationTriangle, FaChevronDown, FaCheck } from 'react-icons/fa';

export default function BranchRequiredGate({ children }) {
  const { userRole, orgId, switchBranch, isAuthenticated, loading } = useAuth();
  const [branches, setBranches] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isSuperAdmin = userRole === 'ROLE_SUPER_ADMIN' || userRole === 'SUPER_ADMIN';
  const isBranchMissing = isSuperAdmin && !orgId;

  useEffect(() => {
    if (isAuthenticated && isBranchMissing) {
      fetchBranches();
    }
  }, [isAuthenticated, isBranchMissing]);

  const fetchBranches = async () => {
    try {
      setFetching(true);
      const resp = await api.get('/api/v1/organizations');
      if (resp.data.success) {
        setBranches(resp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch branches in BranchRequiredGate:", err);
    } finally {
      setFetching(false);
    }
  };

  const handleSelectBranch = () => {
    if (selectedBranch) {
      switchBranch(selectedBranch.id, selectedBranch.name, selectedBranch.timezone);
    }
  };

  if (loading) {
    return (
      <div className="gate-loader">
        <p>Syncing branch context...</p>
        <style jsx>{`
          .gate-loader {
            min-height: 50vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Plus Jakarta Sans', sans-serif;
            color: #64748b;
            font-weight: 600;
          }
        `}</style>
      </div>
    );
  }

  // If not authenticated or not a super admin, or if branch is selected, allow access
  if (!isAuthenticated || !isBranchMissing) {
    return children;
  }

  return (
    <div className="gate-overlay">
      <div className="gate-modal">
        <div className="warning-icon-box">
          <FaExclamationTriangle className="warning-icon" />
        </div>
        <h2>Branch Selection Required</h2>
        <p className="description">
          You are currently in the <strong>Global (All Branches)</strong> view. 
          To record transactions, manage stock, or edit branch configurations, you must select an active branch context.
        </p>

        <div className="selector-wrapper">
          <button 
            className="dropdown-trigger" 
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span>{selectedBranch ? selectedBranch.name : 'Select a branch...'}</span>
            <FaChevronDown className={`chevron ${dropdownOpen ? 'rotate' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="dropdown-menu">
              {fetching ? (
                <div className="dropdown-loading">Syncing branches...</div>
              ) : (
                <ul role="listbox">
                  {branches.map(branch => (
                    <li 
                      key={branch.id} 
                      onClick={() => {
                        setSelectedBranch(branch);
                        setDropdownOpen(false);
                      }}
                      className={selectedBranch?.id === branch.id ? 'active' : ''}
                      role="option"
                      aria-selected={selectedBranch?.id === branch.id}
                    >
                      <span className="branch-name">{branch.name}</span>
                      {selectedBranch?.id === branch.id && <FaCheck className="check" />}
                    </li>
                  ))}
                  {branches.length === 0 && (
                    <div className="dropdown-empty">No active branches found.</div>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <button 
          onClick={handleSelectBranch} 
          disabled={!selectedBranch}
          className="confirm-btn"
        >
          Activate Branch Workspace
        </button>
      </div>

      <style jsx>{`
        .gate-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          animation: fadeIn 0.3s ease;
        }

        .gate-modal {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 460px;
          width: 100%;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.8);
          animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .warning-icon-box {
          width: 64px;
          height: 64px;
          background: #fff7ed;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }

        .warning-icon {
          color: #f97316;
          font-size: 28px;
        }

        h2 {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.5px;
        }

        .description {
          margin: 0 0 28px;
          font-size: 14px;
          line-height: 1.6;
          color: #64748b;
        }

        .selector-wrapper {
          position: relative;
          text-align: left;
          margin-bottom: 24px;
        }

        .dropdown-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dropdown-trigger:hover {
          border-color: #cbd5e1;
          background: #f1f5f9;
        }

        .chevron {
          color: #94a3b8;
          font-size: 12px;
          transition: transform 0.2s;
        }

        .chevron.rotate {
          transform: rotate(180deg);
        }

        .dropdown-menu {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #edf2f7;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          max-height: 200px;
          overflow-y: auto;
          z-index: 10;
        }

        ul {
          list-style: none;
          margin: 0;
          padding: 8px;
        }

        li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          color: #334155;
          cursor: pointer;
          transition: background 0.2s;
        }

        li:hover {
          background: #f8fafc;
        }

        li.active {
          background: #fff7ed;
          color: #c2410c;
        }

        .check {
          color: #f97316;
          font-size: 12px;
        }

        .dropdown-loading, .dropdown-empty {
          padding: 16px;
          text-align: center;
          font-size: 13px;
          color: #94a3b8;
          font-weight: 600;
        }

        .confirm-btn {
          width: 100%;
          padding: 14px;
          background: #f97316;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2);
          transition: all 0.2s;
        }

        .confirm-btn:hover:not(:disabled) {
          background: #ea580c;
          box-shadow: 0 6px 16px rgba(249, 115, 22, 0.3);
        }

        .confirm-btn:disabled {
          background: #cbd5e1;
          color: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
        }
      `}</style>
    </div>
  );
}
