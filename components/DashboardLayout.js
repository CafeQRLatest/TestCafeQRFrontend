import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import {
  FaExpand, FaCompress, FaSignOutAlt, FaBell, FaArrowLeft, FaUserCog, FaChevronDown, FaChevronRight, FaBuilding, FaDesktop, FaCrown, FaBalanceScale, FaTable,
  FaHome, FaBars, FaBookOpen, FaUtensils, FaCashRegister, FaBoxes, FaClock, FaIndustry, FaTruck, FaIdBadge,
  FaCheckCircle, FaExclamationCircle, FaSave, FaCalculator, FaChartBar, FaFileInvoice, FaPlus, FaTimes,
  FaCamera, FaReceipt, FaTags, FaFilter, FaUsers, FaCog, FaChartLine, FaCreditCard, FaUserFriends, FaShoppingCart, FaChair, FaRecycle, FaDatabase
} from 'react-icons/fa';
import SyncStatusBar from './SyncStatusBar';
import BranchSwitcher from './BranchSwitcher';
import CloudPrintStation from './CloudPrintStation';
import { isMenuVisibleForConfig } from '../utils/moduleVisibility';

/**
 * DashboardLayout Component
 */
export default function DashboardLayout({ children, title, subtitle, showBack = false, backUrl = null, noSidebar = false, hideTitle = false, noPadding = false }) {
  const { logout, userRole, email, firstName, lastName, fullName, orgId, orgName, clientName, terminalId, terminalName, isAuthenticated, assignedMenus } = useAuth();
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const userMenuRef = useRef(null);
  const touchStartRef = useRef(null);

  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStartRef.current - touchEnd;
    const isEdgeSwipe = touchStartRef.current < 80; // Start from left edge (increased to 80px)

    // Swipe Left to Right (Open) - only from edge
    if (diff < -50 && isEdgeSwipe) {
      setMobileOpen(true);
    }
    // Swipe Right to Left (Close)
    else if (diff > 50 && mobileOpen) {
      setMobileOpen(false);
    }
    touchStartRef.current = null;
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchConfig();
    }
  }, [isAuthenticated]);

  const fetchConfig = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const resp = await api.get('/api/v1/configurations');
      if (resp.data.success) setConfig(resp.data.data);
    } catch { }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('mousedown', handleClickOutside);

    // Auto-collapse on small desktops
    const onResize = () => {
      if (window.innerWidth < 1200 && window.innerWidth > 1024) setCollapsed(true);
      if (window.innerWidth >= 1200) setCollapsed(false);
    };
    onResize();
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const getInitials = (name, email) => {
    if (name) return name.charAt(0).toUpperCase();
    if (email) return email.charAt(0).toUpperCase();
    return 'U';
  };

  const toggleSidebar = () => {
    if (window.innerWidth <= 1024) {
      setMobileOpen(!mobileOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  return (
    <div className="dashboard-wrapper" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Head>
        <title>{title} | Cafe QR</title>
      </Head>

      <div className="layout-grid">
        {!noSidebar && (
          <aside className={`sidebar-desktop ${collapsed ? 'collapsed' : ''}`}>
            <Sidebar collapsed={collapsed} menus={assignedMenus} config={config} onToggle={() => setCollapsed(!collapsed)} />
          </aside>
        )}

        <div className={`main-content ${noSidebar ? 'no-sidebar' : ''}`}>
          {!noSidebar && (
            <header className={`dashboard-header ${mobileOpen ? 'drawer-active' : ''}`}>
              <div className="header-inner">
                <div className="header-left">
                  <button
                    className="hamburger-btn"
                    onClick={toggleSidebar}
                    aria-label="Toggle Menu"
                  >
                    <FaBars />
                  </button>

                  {showBack && (
                    <button
                      onClick={() => {
                        if (backUrl) {
                          router.push(backUrl);
                        } else {
                          router.back();
                        }
                      }}
                      className="back-btn"
                      title="Go Back"
                      aria-label="Go Back"
                    >
                      <FaArrowLeft />
                    </button>
                  )}

                  <div className="header-text">
                    {!hideTitle && <h1>{title}</h1>}
                  </div>
                </div>

                <div className="header-right">
                  <BranchSwitcher />
                  <button className="icon-btn" title="Notifications">
                    <FaBell />
                    <span className="notif-dot"></span>
                  </button>
                  <button onClick={toggleFullscreen} className="ctrl-btn" title="Toggle Fullscreen">
                    {isFullscreen ? <FaCompress /> : <FaExpand />}
                  </button>

                  <div className="user-menu-container" ref={userMenuRef}>
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className={`avatar-btn ${showUserMenu ? 'active' : ''}`}
                    >
                      <div className="avatar">{getInitials(fullName, email)}</div>
                      <div className="user-info-brief">
                        <span className="user-email-text">{fullName || email?.split('@')[0]}</span>
                        <FaChevronDown className={`chevron ${showUserMenu ? 'rotate' : ''}`} />
                      </div>
                    </button>

                    {showUserMenu && (
                      <div className="user-dropdown">
                        <div className="dropdown-header">
                          <div className="role-badge">{userRole?.replace('ROLE_', '').replace('_', ' ')}</div>
                          <p className="dropdown-user-email">{fullName || email}</p>
                        </div>
                        <div className="dropdown-divider"></div>
                        <div className="dropdown-context-flow">
                          <div className="flow-item">
                            <div className="flow-icon enterprise"><FaCrown /></div>
                            <div className="flow-content">
                              <span className="flow-label">Enterprise</span>
                              <span className="flow-value">{clientName || 'Standard Client'}</span>
                            </div>
                          </div>
                          <div className="flow-connector"></div>
                          <div className="flow-item">
                            <div className="flow-icon branch"><FaBuilding /></div>
                            <div className="flow-content">
                              <span className="flow-label">Branch</span>
                              <span className="flow-value">{orgName || ((userRole === 'ROLE_SUPER_ADMIN' || userRole === 'SUPER_ADMIN') ? 'Universal Access' : (orgId ? 'Branch Context' : 'All Branches'))}</span>
                            </div>
                          </div>
                          <div className="flow-connector"></div>
                          <div className="flow-item">
                            <div className="flow-icon terminal"><FaDesktop /></div>
                            <div className="flow-content">
                              <span className="flow-label">Terminal</span>
                              <span className="flow-value">{terminalName || ((userRole === 'ROLE_SUPER_ADMIN' || userRole === 'SUPER_ADMIN') ? 'Full Control' : (terminalId ? 'Terminal Context' : 'Manager Access'))}</span>
                            </div>
                          </div>
                        </div>
                        <div className="dropdown-divider"></div>
                        <button onClick={() => { setShowUserMenu(false); router.push('/admin/profile'); }} className="dropdown-item">
                          <FaUserCog /> Account Settings
                        </button>
                        <div className="dropdown-divider"></div>
                        <button onClick={logout} className="dropdown-item logout">
                          <FaSignOutAlt /> Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </header>
          )}

          <main className="content-area">
            {children}
            <CloudPrintStation />
          </main>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {!noSidebar && (
        <>
          <div
            className={`mobile-sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
            onClick={() => setMobileOpen(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />
          <aside
            className={`mobile-sidebar ${mobileOpen ? 'open' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <MobileSidebar onNavigate={() => setMobileOpen(false)} menus={assignedMenus} config={config} />
          </aside>
        </>
      )}

      <style jsx global>{`
        body { 
          background: #f8fafc; 
          margin: 0; 
          font-family: 'Plus Jakarta Sans', sans-serif; 
          min-width: 320px;
          overflow-x: clip;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          font-size: 13px;
        }

        /* The Mesh Gradient Background Container */
        .dashboard-wrapper {
          min-height: 100dvh;
          background: 
            radial-gradient(at 0% 0%, rgba(249, 115, 22, 0.05) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(59, 130, 246, 0.05) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.05) 0px, transparent 50%),
            radial-gradient(at 0% 100%, rgba(236, 72, 153, 0.05) 0px, transparent 50%);
          background-color: #f8fafc;
        }
        
        .sidebar-link {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 16px; margin: 4px 12px;
          border-radius: 12px; color: #64748b;
          font-weight: 600; font-size: 13px; text-decoration: none;
          transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
          border: 1px solid transparent;
        }
        .sidebar-link:hover { 
          background: rgba(255, 255, 255, 0.8); 
          color: #0f172a; 
          transform: translateY(-1px);
          border-color: rgba(226, 232, 240, 0.8);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }
        .sidebar-link.active {
          background: #f97316; 
          color: white; 
          font-weight: 700;
          box-shadow: 0 8px 16px -4px rgba(249, 115, 22, 0.4);
          transform: translateY(-1px);
        }
        .sidebar-icon { font-size: 16px; display: flex; align-items: center; justify-content: center; }
        .sidebar-section-title {
          font-size: 10px; font-weight: 800; color: #94a3b8;
          text-transform: uppercase; letter-spacing: 0.1em;
          margin: 20px 24px 8px;
        }

        /* Collapsed sidebar nav items */
        .collapsed-link {
          padding: 0 !important;
          margin: 3px 10px !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          transform: none !important;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .collapsed-link:hover { background: transparent !important; transform: none !important; }

        /* Icon pill â€” the container inside collapsed links */
        .icon-pill {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: transparent;
          color: #64748b;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.18s, color 0.18s;
        }
        .collapsed-link:hover .icon-pill {
          background: #f1f5f9;
          color: #0f172a;
        }
        .collapsed-link.active .icon-pill,
        .icon-pill-active {
          background: #f97316 !important;
          color: white !important;
          box-shadow: 0 4px 12px rgba(249,115,22,0.25);
        }

        .collapsed .sidebar-section-title { display: none; }

        .sidebar-toggle-btn:hover { 
          background: #fff7ed; 
          border-color: #f97316; 
          color: #f97316;
        }
        .pulse-dot-orange {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ea580c;
          animation: blink 1.5s infinite;
          display: inline-block;
        }
      `}</style>

      <style jsx>{`
        .layout-grid {
          display: flex;
          min-height: 100dvh;
          width: 100%;
          min-width: 0;
        }

        .sidebar-desktop {
          width: 250px;
          height: 100vh;
          position: sticky;
          top: 0;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-right: 1px solid rgba(226, 232, 240, 0.6);
          transition: width 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          flex-shrink: 0;
          z-index: 100;
          display: flex;
          flex-direction: column;
        }
        .sidebar-desktop.collapsed { width: 64px; }

        .main-content {
          flex: 1;
          min-width: 0; /* Important for flex child items to not overflow */
          background: #f8fafc;
          width: 100%;
        }

        .dashboard-header {
           min-height: 60px;
           background: rgba(255, 255, 255, 0.75);
           backdrop-filter: blur(20px) saturate(180%);
           -webkit-backdrop-filter: blur(20px) saturate(180%);
           border-bottom: 1px solid rgba(226, 232, 240, 0.6);
           position: sticky; top: 0; z-index: 40;
           padding: 0 max(clamp(14px, 2.6vw, 40px), env(safe-area-inset-right, 0px)) 0 max(clamp(14px, 2.6vw, 40px), env(safe-area-inset-left, 0px));
           box-shadow: 
             0 1px 3px 0 rgba(0, 0, 0, 0.02),
             0 4px 12px -4px rgba(0, 0, 0, 0.03);
        }
        .header-inner {
           min-height: 60px;
           display: flex; justify-content: space-between; align-items: center;
           gap: 12px;
           min-width: 0;
        }

        .hamburger-btn {
          display: none;
          width: 44px; height: 44px; border-radius: 14px;
          border: 1px solid rgba(226, 232, 240, 0.8); background: white;
          color: #64748b; font-size: 18px; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .hamburger-btn:hover { border-color: #f97316; color: #f97316; box-shadow: 0 8px 20px -8px rgba(249, 115, 22, 0.3); }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 11px;
          border: 1px solid rgba(226, 232, 240, 0.8);
          background: white;
          color: #64748b;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .back-btn:hover {
          border-color: #f97316;
          color: #f97316;
          box-shadow: 0 8px 20px -8px rgba(249, 115, 22, 0.3);
          transform: translateY(-1px);
        }

        .dashboard-wrapper { min-height: 100dvh; position: relative; }
        
        .header-left { display: flex; align-items: center; gap: clamp(10px, 2vw, 24px); min-width: 0; flex-shrink: 0; }
        .header-text { min-width: 0; }
        
        .header-text h1 { 
          font-size: 18px; 
          font-weight: 800; 
          color: #0f172a; 
          margin: 0; 
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .header-right { display: flex; align-items: center; gap: clamp(8px, 1.6vw, 16px); flex: 0 0 auto; }
        
        .icon-btn, .ctrl-btn {
           width: 38px; height: 38px; border-radius: 12px;
           background: white; border: 1px solid rgba(226, 232, 240, 0.8);
           display: flex; align-items: center; justify-content: center;
           font-size: 16px; color: #64748b; cursor: pointer; 
           transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
           position: relative;
        }
        .icon-btn:hover, .ctrl-btn:hover { 
          border-color: #f97316; 
          color: #f97316; 
          background: #ffffff;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px -8px rgba(249, 115, 22, 0.3);
        }
        
        .notif-dot {
           position: absolute; top: 12px; right: 12px;
           width: 9px; height: 9px; background: #ef4444;
           border-radius: 50%; border: 2px solid white;
           box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
        }

        .user-menu-container { position: relative; }
        
        .avatar-btn {
           display: flex; align-items: center; gap: 8px;
           padding: 4px 8px 4px 4px; border-radius: 12px;
           background: transparent; border: 1px solid transparent;
           cursor: pointer; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .avatar-btn:hover, .avatar-btn.active { 
          background: rgba(249, 115, 22, 0.05);
          border-color: rgba(249, 115, 22, 0.1);
          transform: translateY(-1px);
        }

        .avatar {
           width: 32px; height: 32px; border-radius: 10px;
           background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
           color: white; display: flex; align-items: center; justify-content: center;
           font-weight: 800; font-size: 14px;
           box-shadow: 0 4px 8px rgba(249, 115, 22, 0.15);
        }

        .user-info-brief { display: flex; align-items: center; gap: 8px; }
        .user-email-text { font-size: 13px; font-weight: 700; color: #1e293b; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chevron { font-size: 10px; color: #94a3b8; transition: transform 0.3s; }
        .chevron.rotate { transform: rotate(180deg); }

        .user-dropdown {
           position: absolute; top: calc(100% + 12px); right: 0;
           width: min(260px, calc(100vw - 24px)); background: white; border-radius: 16px;
           border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.1);
           padding: 8px; z-index: 100; animation: slideIn 0.2s ease-out;
        }

        @keyframes slideIn {
           from { opacity: 0; transform: translateY(10px); }
           to { opacity: 1; transform: translateY(0); }
        }

        .dropdown-header { padding: 12px; display: flex; flex-direction: column; gap: 4px; }
        .role-badge { 
          padding: 4px 8px; background: #fdf2f8; color: #db2777; 
          font-size: 10px; font-weight: 800; border-radius: 20px; 
          text-transform: uppercase; width: fit-content;
        }
        .dropdown-user-email { font-size: 13px; font-weight: 600; color: #64748b; margin: 0; }
        
        .dropdown-divider { height: 1px; background: #f1f5f9; margin: 8px 0; }

        .dropdown-context-flow { padding: 8px; display: flex; flex-direction: column; gap: 4px; }
        .flow-item { display: flex; align-items: center; gap: 12px; }
        .flow-icon { 
          width: 24px; height: 24px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; font-size: 10px; 
        }
        .flow-icon.enterprise { color: #6366f1; background: #eef2ff; }
        .flow-icon.branch { color: #f97316; background: #fff7ed; }
        .flow-icon.terminal { color: #0ea5e9; background: #f0f9ff; }
        
        .flow-content { display: flex; flex-direction: column; }
        .flow-label { font-size: 9px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
        .flow-value { font-size: 12px; font-weight: 700; color: #334155; }

        .dropdown-item {
           width: 100%; display: flex; align-items: center; gap: 12px;
           padding: 10px 12px; border-radius: 8px; border: none;
           background: transparent; color: #475569; font-size: 14px; font-weight: 600;
           cursor: pointer; transition: all 0.2s; text-align: left;
        }
        .dropdown-item:hover { background: #f8fafc; color: #f97316; }
        .dropdown-item.logout { color: #ef4444; }
        .dropdown-item.logout:hover { background: #fef2f2; }

        .content-area {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          padding: ${noPadding ? '0' : (noSidebar ? '0' : 'clamp(12px, 2.2vw, 24px)')};
          padding-bottom: ${noPadding ? '0' : (noSidebar ? '0' : 'calc(clamp(16px, 2.2vw, 24px) + env(safe-area-inset-bottom, 0px))')};
        }

        /* Mobile Sidebar Drawer */
        .mobile-sidebar {
          position: fixed; left: 0; top: 0; bottom: 0;
          width: min(320px, 86vw); background: white; z-index: 1000;
          transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 20px 0 50px rgba(0,0,0,0.1);
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .mobile-sidebar.open { transform: translateX(0); }
        .mobile-sidebar-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.4);
          z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.3s;
          backdrop-filter: blur(4px);
        }
        .mobile-sidebar-backdrop.visible { opacity: 1; pointer-events: auto; }

        @media (max-width: 1024px) {
          .sidebar-desktop { display: none; }
          .hamburger-btn { display: flex; }
          .mobile-hide { display: none; }
          .dashboard-header { padding: 0 max(14px, env(safe-area-inset-right, 0px)) 0 max(14px, env(safe-area-inset-left, 0px)); }
          .content-area { padding: 16px; padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
        }

        @media (max-width: 640px) {
          .dashboard-header { min-height: 58px; }
          .header-inner { min-height: 58px; }
          .header-text { display: none !important; }
          .ctrl-btn { display: none !important; }
          .icon-btn, .back-btn { width: 36px; height: 36px; border-radius: 11px; }
          .user-info-brief { display: none; }
          .avatar-btn { padding: 0; border: none; background: transparent; }
          .avatar-btn:hover, .avatar-btn.active { background: transparent; transform: scale(1.05); }
          .avatar { width: 32px; height: 32px; border-radius: 10px; }
          .content-area { padding: 12px; padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
        }

        @media (max-width: 380px) {
          .header-text h1 { max-width: 38vw; }
          .icon-btn { display: none; }
        }
      `}</style>
    </div>
  );
}

const MENU_CONFIG = {
  "Dashboard": { name: "Overview", icon: <FaHome /> },
  "Product Management": { name: "Product Management", icon: <FaBookOpen /> },
  "Orders": { name: "Orders", icon: <FaUtensils /> },
  "Sales": { name: "POS", icon: <FaCashRegister /> },
  "Table Management": { name: "Table Management", icon: <FaTable /> },

  "Purchase Orders": { name: "Purchase Orders", icon: <FaShoppingCart /> },
  "Stock": { name: "Stock and Inventory", icon: <FaBoxes /> },
  "QR Availability": { name: "QR Availability", icon: <FaClock /> },
  "Delivery Hours": { name: "Delivery Hours", icon: <FaTruck /> },
  "Credit Customers": { name: "Credit Customers", icon: <FaUserFriends /> },
  "Credit Sales": { name: "Credit Sales Ledger", icon: <FaBookOpen /> },
  "Offline Sync Center": { name: "Offline Sync Center", icon: <FaClock /> },
  "Waste Management": { name: "Waste Management", icon: <FaRecycle /> },

  "Point of Sale": { name: "POS", icon: <FaCashRegister />, url: "/owner/sales" },
  "Customers": { name: "Customers", icon: <FaIdBadge /> },
  "Loyalty": { name: "Loyalty", icon: <FaCrown /> },

  "Analytics": { name: "Analytics", icon: <FaChartBar /> },
  "Sales_Insight": { name: "Sales", icon: <FaChartLine /> },
  "Expenses": { name: "Expenses & Bills", icon: <FaReceipt /> },
  "Accounting": { name: "Accounting", icon: <FaBalanceScale /> },
  "Reports & Billing": { name: "Reports & Billing", icon: <FaCalculator />, url: "/owner/reports" },
  "Billing & Reports": { name: "Reports & Billing", icon: <FaCalculator />, url: "/owner/reports" },

  "Organization": { name: "Organization and Team", icon: <FaUserCog /> },
  "Subscription": { name: "Subscription", icon: <FaCreditCard /> },
  "Configurations": { name: "Settings", icon: <FaCog /> },
  "Document Sequences": { name: "Document Sequences", icon: <FaFileInvoice /> },
  "Data Backup": { name: "Data Backup", icon: <FaDatabase /> },
  "Partners": { name: "Partners", icon: <FaUserFriends /> },
  "Payment Types": { name: "Payment Types", icon: <FaCreditCard />, url: "/owner/payment-types" }
};

const CATEGORY_MAPPING = {
  "Dashboard": "OPERATIONS",
  "Product Management": "OPERATIONS",
  "Orders": "OPERATIONS",
  "Sales": "OPERATIONS",
  "Table Management": "OPERATIONS",

  "Purchase Orders": "ADD ON",
  "Stock": "ADD ON",
  "QR Availability": "ADD ON",
  "Delivery Hours": "ADD ON",
  "Credit Customers": "ADD ON",
  "Credit Sales": "ADD ON",
  "Offline Sync Center": "ADD ON",
  "Waste Management": "ADD ON",

  "Point of Sale": "OPERATIONS",
  "Customers": "CUSTOMERS",
  "Loyalty": "CUSTOMERS",

  "Analytics": "INSIGHTS",
  "Sales_Insight": "INSIGHTS",
  "Expenses": "INSIGHTS",
  "Accounting": "INSIGHTS",
  "Reports & Billing": "INSIGHTS",

  "Organization": "ACCOUNT",
  "Subscription": "ACCOUNT",
  "Configurations": "ACCOUNT",
  "Partners": "ACCOUNT",
  "Data Backup": "ACCOUNT",
  "Document Sequences": "ACCOUNT"
};

const MENU_ORDER = [
  "Dashboard", "Product Management", "Orders", "Point of Sale", "Sales", "Table Management",
  "Purchase Orders", "Stock", "QR Availability", "Delivery Hours", "Credit Customers", "Credit Sales", "Offline Sync Center", "Waste Management",
  "Customers", "Loyalty",
  "Analytics", "Sales_Insight", "Expenses", "Reports & Billing", "Billing & Reports", "Accounting",
  "Organization", "Partners", "Subscription", "Configurations", "Document Sequences", "Data Backup"
];

// ─── INTERNAL COMPONENTS ────────────────────────────────────────────────────────

function Sidebar({ collapsed, menus = [], config, onToggle }) {
  const router = useRouter();
  const { userRole, hasModule } = useAuth();
  const showExploreAddons = userRole === 'OWNER' && (!hasModule('INVENTORY') || !hasModule('CREDIT_LEDGER'));

  const menuConfig = MENU_CONFIG;
  const categoryMapping = CATEGORY_MAPPING;
  const menuOrder = MENU_ORDER;

  const hasPointOfSale = menus.some(m => m.name === "Point of Sale");
  const parentMenus = menus.filter(m => {
    const isParent = (!m.parentId && !m.parent_id);
    if (!isParent) return false;
    if (m.name === "Sales" && hasPointOfSale) return false;

    if (!isMenuVisibleForConfig(m, config)) return false;

    // Strict Sachet Gate: cashier/manager cannot see unsubscribed features, owners see them to prompt upgrading
    if (userRole !== 'OWNER') {
      if ((m.name === "Stock" || m.name === "Purchase Orders" || m.name === "Waste Management") && !hasModule('INVENTORY')) {
        return false;
      }
      if ((m.name === "Credit Customers" || m.name === "Credit Sales") && !hasModule('CREDIT_LEDGER')) {
        return false;
      }
      if (m.name === "Table Management" && !hasModule('TABLE_QR')) {
        return false;
      }
    }

    return true;
  });

  const groupedMenus = {
    "OPERATIONS": [],
    "ADD ON": [],
    "CUSTOMERS": [],
    "INSIGHTS": [],
    "ACCOUNT": []
  };

  parentMenus.forEach(m => {
    const cat = categoryMapping[m.name] || "OPERATIONS";
    groupedMenus[cat].push(m);
  });

  Object.keys(groupedMenus).forEach(cat => {
    groupedMenus[cat].sort((a, b) => {
      let indexA = menuOrder.indexOf(a.name);
      let indexB = menuOrder.indexOf(b.name);
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      return indexA - indexB;
    });
  });

  const STATIC_ACCOUNT_LINKS = [];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* â”€â”€ Sidebar Header â”€â”€ */}
      {collapsed ? (
        /* COLLAPSED: logo + expand button stacked */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, padding: '16px 8px 12px',
          borderBottom: '1px solid rgba(226,232,240,0.5)',
        }}>
          <Link href="/owner/main-menu" style={{ textDecoration: 'none' }}>
            <img src="/logo.jpg" alt="Cafe QR Logo" style={{
              width: 36, height: 36, borderRadius: 10,
              objectFit: 'cover',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }} />
          </Link>
          {/* Expand button â€” same â˜° button as collapse */}
          <button
            onClick={onToggle}
            className="sidebar-toggle-btn"
            title="Expand sidebar"
          >
            <FaBars style={{ fontSize: '10px' }} />
          </button>
        </div>
      ) : (
        /* EXPANDED: logo + title + collapse button inline */
        <div style={{
          padding: '18px 16px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(226,232,240,0.5)',
        }}>
          <Link href="/owner/main-menu" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
            <img src="/logo.jpg" alt="Cafe QR Logo" style={{
              width: 34, height: 34, borderRadius: 10,
              objectFit: 'cover', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }} />
            <span style={{
              fontSize: 15, fontWeight: 900, color: '#0f172a',
              letterSpacing: '-0.03em', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
              animation: 'fadeIn 0.3s ease-out'
            }}>Cafe QR POS</span>
          </Link>
          <button onClick={onToggle} className="sidebar-toggle-btn" title="Collapse sidebar" style={{ flexShrink: 0 }}>
            <FaBars style={{ fontSize: '10px' }} />
          </button>
        </div>
      )}




      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px', paddingTop: '8px' }} className="custom-scrollbar">
        {Object.entries(groupedMenus).map(([categoryName, items]) => {
          const staticItems = categoryName === 'ACCOUNT' ? STATIC_ACCOUNT_LINKS : [];
          const showExplore = categoryName === 'ADD ON' && showExploreAddons;
          const allItems = [...items, ...staticItems];
          if (allItems.length === 0 && !showExplore) return null;
          return (
            <React.Fragment key={categoryName}>
              {/* Section title — hidden in collapsed */}
              {!collapsed && <div className="sidebar-section-title">{categoryName}</div>}
              {collapsed && <div style={{ height: 6 }} />}
              {allItems.map(m => {
                const configItem = menuConfig[m.name] || {};
                const targetUrl = configItem.url || m.url;
                const active = router.pathname === targetUrl;
                const displayName = configItem.name || m.name;
                const displayIcon = configItem.icon || <FaBuilding />;
                return (
                  <Link
                    key={m.id || m._id || m.url}
                    href={targetUrl}
                    className={`sidebar-link ${active ? 'active' : ''} ${collapsed ? 'collapsed-link' : ''}`}
                    title={collapsed ? displayName : ''}
                  >
                    <div className={`sidebar-icon ${collapsed ? 'icon-pill' : ''} ${active && collapsed ? 'icon-pill-active' : ''}`}>
                      {displayIcon}
                    </div>
                    {!collapsed && <span style={{ animation: 'fadeIn 0.2s ease-out' }}>{displayName}</span>}
                  </Link>
                );
              })}
              {showExplore && (
                <Link
                  href="/subscription"
                  className={`sidebar-link ${router.pathname === '/subscription' ? 'active' : ''} ${collapsed ? 'collapsed-link' : ''}`}
                  title={collapsed ? "Explore Add-ons" : ''}
                >
                  <div className={`sidebar-icon ${collapsed ? 'icon-pill' : ''} ${router.pathname === '/subscription' && collapsed ? 'icon-pill-active' : ''}`} style={{ color: '#ea580c' }}>
                    <FaCrown />
                  </div>
                  {!collapsed && (
                    <span style={{ color: '#ea580c', fontWeight: '800', display: 'flex', alignItems: 'center', gap: 6, animation: 'fadeIn 0.2s ease-out' }}>
                      Explore Add-ons <span className="pulse-dot-orange"></span>
                    </span>
                  )}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ flexShrink: 0 }}>
        <SyncStatusBar collapsed={collapsed} />
        {/* Bottom toggle button when collapsed */}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 14px' }}>
            <button onClick={onToggle} className="sidebar-toggle-btn" title="Expand sidebar" style={{ width: 32, height: 32, borderRadius: 9 }}>
              <FaBars style={{ fontSize: '11px' }} />
            </button>
          </div>
        )}
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 14px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>CafÃ© QR v1.2</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.3) rgba(0, 0, 0, 0.01);
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.01); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(249, 115, 22, 0.6); }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}

function MobileSidebar({ onNavigate, menus = [], config }) {
  const router = useRouter();
  const { logout, userRole, hasModule } = useAuth();
  const showExploreAddons = userRole === 'OWNER' && (!hasModule('INVENTORY') || !hasModule('CREDIT_LEDGER'));

  // Mapping to old Cafe QR names and premium icons (identical to desktop Sidebar)
  const menuConfig = {
    "Dashboard": { name: "Overview", icon: <FaHome /> },
    "Product Management": { name: "Product Management", icon: <FaBookOpen /> },
    "Orders": { name: "Orders", icon: <FaUtensils /> },
    "Sales": { name: "POS", icon: <FaCashRegister /> },
    "Table Management": { name: "Table Management", icon: <FaTable /> },

    "Purchase Orders": { name: "Purchase Orders", icon: <FaShoppingCart /> },
    "Stock": { name: "Stock and Inventory", icon: <FaBoxes /> },
    "QR Availability": { name: "QR Availability", icon: <FaClock /> },
    "Delivery Hours": { name: "Delivery Hours", icon: <FaTruck /> },
    "Credit Customers": { name: "Credit Customers", icon: <FaUserFriends /> },
    "Credit Sales": { name: "Credit Sales Ledger", icon: <FaBookOpen /> },
    "Offline Sync Center": { name: "Offline Sync Center", icon: <FaClock /> },
    "Waste Management": { name: "Waste Management", icon: <FaRecycle /> },

    "Point of Sale": { name: "POS", icon: <FaCashRegister />, url: "/owner/sales" },
    "Customers": { name: "Customers", icon: <FaIdBadge /> },
    "Loyalty": { name: "Loyalty", icon: <FaCrown /> },

    "Analytics": { name: "Analytics", icon: <FaChartBar /> },
    "Sales_Insight": { name: "Sales", icon: <FaChartLine /> },
    "Expenses": { name: "Expenses & Bills", icon: <FaReceipt /> },
    "Accounting": { name: "Accounting", icon: <FaBalanceScale /> },
    "Reports & Billing": { name: "Reports & Billing", icon: <FaCalculator />, url: "/owner/reports" },
    "Billing & Reports": { name: "Reports & Billing", icon: <FaCalculator />, url: "/owner/reports" },

    "Organization": { name: "Organization and Team", icon: <FaUserCog /> },
    "Subscription": { name: "Subscription", icon: <FaCreditCard /> },
    "Configurations": { name: "Settings", icon: <FaCog /> },
    "Document Sequences": { name: "Document Sequences", icon: <FaFileInvoice /> },
    "Data Backup": { name: "Data Backup", icon: <FaDatabase /> },
    "Partners": { name: "Partners", icon: <FaUserFriends /> },
    "Payment Types": { name: "Payment Types", icon: <FaCreditCard />, url: "/owner/payment-types" }
  };

  const categoryMapping = {
    "Dashboard": "OPERATIONS",
    "Product Management": "OPERATIONS",
    "Orders": "OPERATIONS",
    "Sales": "OPERATIONS",
    "Table Management": "OPERATIONS",

    "Purchase Orders": "ADD ON",
    "Stock": "ADD ON",
    "QR Availability": "ADD ON",
    "Delivery Hours": "ADD ON",
    "Credit Customers": "ADD ON",
    "Credit Sales": "ADD ON",
    "Offline Sync Center": "ADD ON",
    "Waste Management": "ADD ON",

    "Point of Sale": "OPERATIONS",
    "Customers": "CUSTOMERS",
    "Loyalty": "CUSTOMERS",

    "Analytics": "INSIGHTS",
    "Sales_Insight": "INSIGHTS",
    "Expenses": "INSIGHTS",
    "Accounting": "INSIGHTS",
    "Reports & Billing": "INSIGHTS",

    "Organization": "ACCOUNT",
    "Subscription": "ACCOUNT",
    "Configurations": "ACCOUNT",
    "Partners": "ACCOUNT",
    "Data Backup": "ACCOUNT",
    "Document Sequences": "ACCOUNT"
  };

  const menuOrder = [
    "Dashboard", "Product Management", "Orders", "Point of Sale", "Sales", "Table Management",
    "Purchase Orders", "Stock", "QR Availability", "Delivery Hours", "Credit Customers", "Credit Sales", "Offline Sync Center", "Waste Management",
    "Customers", "Loyalty",
    "Analytics", "Sales_Insight", "Expenses", "Reports & Billing", "Billing & Reports", "Accounting",
    "Organization", "Partners", "Subscription", "Configurations", "Document Sequences", "Data Backup"
  ];

  const hasPointOfSale = menus.some(m => m.name === "Point of Sale");
  const parentMenus = menus.filter(m => {
    const isParent = (!m.parentId && !m.parent_id);
    if (!isParent) return false;
    if (m.name === "Sales" && hasPointOfSale) return false;

    if (!isMenuVisibleForConfig(m, config)) return false;

    // Strict Sachet Gate: cashier/manager cannot see unsubscribed features, owners see them to prompt upgrading
    if (userRole !== 'OWNER') {
      if ((m.name === "Stock" || m.name === "Purchase Orders" || m.name === "Waste Management") && !hasModule('INVENTORY')) {
        return false;
      }
      if ((m.name === "Credit Customers" || m.name === "Credit Sales") && !hasModule('CREDIT_LEDGER')) {
        return false;
      }
      if (m.name === "Table Management" && !hasModule('TABLE_QR')) {
        return false;
      }
    }

    return true;
  });

  const groupedMenus = {
    "OPERATIONS": [],
    "ADD ON": [],
    "CUSTOMERS": [],
    "INSIGHTS": [],
    "ACCOUNT": []
  };

  parentMenus.forEach(m => {
    const cat = categoryMapping[m.name] || "OPERATIONS";
    groupedMenus[cat].push(m);
  });

  Object.keys(groupedMenus).forEach(cat => {
    groupedMenus[cat].sort((a, b) => {
      let indexA = menuOrder.indexOf(a.name);
      let indexB = menuOrder.indexOf(b.name);
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      return indexA - indexB;
    });
  });

  const STATIC_ACCOUNT_LINKS = [];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '32px 24px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <img src="/logo.jpg" alt="Cafe QR Logo" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover' }} />
        <span style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.04em' }}>Cafe QR POS</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {Object.entries(groupedMenus).map(([categoryName, items]) => {
          const staticItems = categoryName === 'ACCOUNT' ? STATIC_ACCOUNT_LINKS : [];
          const showExplore = categoryName === 'ADD ON' && showExploreAddons;
          const allItems = [...items, ...staticItems];
          if (allItems.length === 0 && !showExplore) return null;
          return (
            <React.Fragment key={categoryName}>
              <div className="sidebar-section-title">{categoryName}</div>
              {allItems.map(m => {
                const configItem = menuConfig[m.name] || {};
                const targetUrl = configItem.url || m.url;
                const active = router.pathname === targetUrl;
                const displayName = configItem.name || m.name;
                const displayIcon = configItem.icon || <FaBuilding />;
                return (
                  <Link
                    key={m.id || m._id || m.url}
                    href={targetUrl}
                    onClick={onNavigate}
                    className={`sidebar-link ${active ? 'active' : ''}`}
                  >
                    <div className="sidebar-icon">{displayIcon}</div>
                    <span>{displayName}</span>
                  </Link>
                );
              })}
              {showExplore && (
                <Link
                  href="/subscription"
                  onClick={onNavigate}
                  className={`sidebar-link ${router.pathname === '/subscription' ? 'active' : ''}`}
                  style={{ color: '#ea580c' }}
                >
                  <div className="sidebar-icon"><FaCrown /></div>
                  <span style={{ fontWeight: '800' }}>Explore Add-ons</span>
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}>
        <button onClick={logout} className="dropdown-item logout" style={{ padding: '14px', justifyContent: 'center', borderRadius: '12px', background: '#fef2f2' }}>
          <FaSignOutAlt /> Sign Out
        </button>
      </div>
    </div>
  );
}
