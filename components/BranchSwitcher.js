import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { FaBuilding, FaChevronDown, FaCheck } from 'react-icons/fa';

export default function BranchSwitcher() {
  const { userRole, orgId, orgName, switchBranch, isAuthenticated } = useAuth();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isSuperAdmin = userRole === 'ROLE_SUPER_ADMIN' || userRole === 'SUPER_ADMIN';

  useEffect(() => {
    if (isAuthenticated && isSuperAdmin) {
      fetchBranches();
    }
  }, [isAuthenticated, userRole]);

  useEffect(() => {
    if (isSuperAdmin && branches.length > 0 && !orgId) {
      const firstBranch = branches[0];
      switchBranch(firstBranch.id, firstBranch.name);
    }
  }, [branches, orgId, isSuperAdmin, switchBranch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const resp = await api.get('/api/v1/organizations');
      if (resp.data.success) {
        setBranches(resp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch branches in BranchSwitcher:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (branch) => {
    if (branch === 'ALL') {
      switchBranch(null, null);
    } else {
      switchBranch(branch.id, branch.name);
    }
    setIsOpen(false);
  };

  if (!isAuthenticated) return null;

  // For normal branch users, show a static badge
  if (!isSuperAdmin) {
    return (
      <div className="branch-static-badge">
        <FaBuilding className="icon" />
        <span className="name">{orgName || 'Branch View'}</span>
        <style jsx>{`
          .branch-static-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            color: #475569;
            font-size: 13px;
            font-weight: 700;
            font-family: 'Plus Jakarta Sans', sans-serif;
          }
          .branch-static-badge :global(.icon) {
            color: #64748b;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }

  const selectedName = orgName || 'Select Branch...';

  return (
    <div className="branch-switcher-container" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`switcher-trigger ${isOpen ? 'active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="trigger-content">
          <FaBuilding className="building-icon" />
          <div className="text-info">
            <span className="label">Active Branch</span>
            <span className="current-branch">{selectedName}</span>
          </div>
        </div>
        <FaChevronDown className={`chevron-icon ${isOpen ? 'rotate' : ''}`} />
      </button>

      {isOpen && (
        <div className="switcher-dropdown">
          <div className="dropdown-header">Select Workspace Branch</div>
          <ul className="branch-list" role="listbox">

            {loading ? (
              <li className="loading-item">Syncing network nodes...</li>
            ) : (
              branches.map(branch => (
                <li 
                  key={branch.id}
                  onClick={() => handleSelect(branch)} 
                  className={`branch-item ${orgId === branch.id ? 'selected' : ''}`}
                  role="option"
                  aria-selected={orgId === branch.id}
                >
                  <div className="item-main">
                    <span className="branch-name">{branch.name}</span>
                    <span className="branch-code">{branch.branchCode || 'BR'}</span>
                  </div>
                  {orgId === branch.id && <FaCheck className="check-icon" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <style jsx>{`
        .branch-switcher-container {
          position: relative;
          font-family: 'Plus Jakarta Sans', sans-serif;
          z-index: 100;
        }

        .switcher-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          min-width: 200px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          text-align: left;
        }

        .switcher-trigger:hover, .switcher-trigger.active {
          border-color: #f97316;
          background: white;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.05);
        }

        .trigger-content {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .building-icon {
          color: #f97316;
          font-size: 16px;
          transition: transform 0.2s;
        }

        .switcher-trigger:hover .building-icon {
          transform: scale(1.1);
        }

        .text-info {
          display: flex;
          flex-direction: column;
        }

        .label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          line-height: 1.2;
        }

        .current-branch {
          font-size: 13px;
          font-weight: 800;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }

        .chevron-icon {
          color: #94a3b8;
          font-size: 12px;
          transition: transform 0.2s;
        }

        .chevron-icon.rotate {
          transform: rotate(180deg);
          color: #f97316;
        }

        .switcher-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          width: 260px;
          background: white;
          border: 1px solid #edf2f7;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-header {
          padding: 12px 16px;
          background: #f8fafc;
          border-bottom: 1px solid #f1f5f9;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .branch-list {
          list-style: none;
          margin: 0;
          padding: 6px;
          max-height: 280px;
          overflow-y: auto;
        }

        .branch-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .branch-item:hover {
          background: #f8fafc;
        }

        .branch-item.selected {
          background: #fff7ed;
        }

        .item-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
        }

        .branch-name {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .branch-item.selected .branch-name {
          color: #c2410c;
        }

        .branch-code {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .branch-item.selected .branch-code {
          color: #f97316;
        }

        .check-icon {
          color: #ea580c;
          font-size: 12px;
          margin-left: 8px;
        }

        .loading-item {
          padding: 16px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
