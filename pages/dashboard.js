import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

import {
  FaBookOpen,
  FaCashRegister,
  FaFileInvoice,
  FaTimes,
  FaExclamationTriangle,
  FaArrowRight,
  FaShoppingBag,
  FaChartLine,
  FaWallet,
  FaBoxOpen,
  FaSignOutAlt,
  FaExpand,
  FaCompress,
  FaHdd,
  FaShieldAlt,
  FaBuilding,
  FaUsers,
  FaLock
} from 'react-icons/fa';
import DashboardLayout from '../components/DashboardLayout';
import api from '../utils/api';

function formatCurrency(n) {
  const num = Number(n || 0);
  return `₹${num.toFixed(2)}`;
}

export default function DashboardPage() {
  return <DashboardOverview />;
}

function DashboardOverview() {
  const { logout, subscriptionExpiryDate, orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [stats, setStats] = useState({ liveOrders: 0, revenueToday: 0, avgTicket: 0, outOfStock: 0 });
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menus, setMenus] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    fetchMenus();
  }, [orgId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
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

  const fetchDashboardData = async () => {
    try {
      const res = await api.get('/api/v1/orders');
      const result = res.data;
      
      if (result.success && result.data) {
        setOrders(result.data.slice(0, 5));
        
        const live = result.data.filter(o => o.status === 'NEW' || o.status === 'IN_PROGRESS').length;
        const rev = result.data.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const avg = result.data.length > 0 ? rev / result.data.length : 0;
        
        setStats({
          liveOrders: live,
          revenueToday: rev,
          avgTicket: avg,
          outOfStock: 0 
        });
      }
    } catch (e) {
      setErr('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMenus = async () => {
    try {
      const resp = await api.get('/api/v1/users/menus');
      if (resp.data.success) {
        setMenus(resp.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch menus:", err);
    }
  };

  const getMenuIcon = (name) => {
    const mapping = {
      'Point of Sale': { icon: <FaCashRegister />, color: "#3b82f6" },
      'Product Management': { icon: <FaBookOpen />, color: "#f97316" }
    };
    return mapping[name] || { icon: <FaLock />, color: "#64748b" };
  };

  const daysLeft = subscriptionExpiryDate 
    ? Math.ceil((new Date(subscriptionExpiryDate) - new Date()) / (1000 * 60 * 60 * 24)) 
    : 0;

  return (
    <DashboardLayout 
      title="Business Overview" 
      showBack={true}
    >
        {daysLeft > 0 && daysLeft <= 3 && (
          <div className="trial-alert">
            <FaExclamationTriangle className="alert-icon" />
            <span>Your free trial ends in <strong>{daysLeft} days</strong>. <Link href="/subscription">Renew now</Link> to stay online.</span>
          </div>
        )}

        {err && <div className="error-banner">{err}</div>}

        <div className="stats-grid">
           <StatCard label="Live Orders" value={stats.liveOrders} icon={<FaShoppingBag />} color="#f97316" unit="Orders" />
           <StatCard label="Daily Revenue" value={formatCurrency(stats.revenueToday)} icon={<FaChartLine />} color="#10b981" />
           <StatCard label="Avg Ticket" value={formatCurrency(stats.avgTicket)} icon={<FaWallet />} color="#3b82f6" />
           <StatCard label="Low Stock" value={stats.outOfStock} icon={<FaBoxOpen />} color="#ef4444" unit="Items" />
        </div>

        <div className="dashboard-grid">
           <section className="orders-section">
              <div className="section-card">
                 <div className="card-header">
                    <h3>Recent Activity</h3>
                    <Link href="/orders" className="view-link">View All <FaArrowRight /></Link>
                 </div>
                 <div className="table-container">
                    {loading ? <div className="loader">Loading records...</div> : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Status</th>
                            <th>Total</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map(o => (
                            <tr key={o.id} onClick={() => setSelectedOrder(o)}>
                              <td><span className="id-badge">#{o.id.substring(0,8)}</span></td>
                              <td><span className={`status-pill ${o.status.toLowerCase()}`}>{o.status}</span></td>
                              <td className="amount">{formatCurrency(o.totalAmount)}</td>
                              <td><button className="row-btn">Details</button></td>
                            </tr>
                          ))}
                          {orders.length === 0 && <tr><td colSpan="4" className="empty-msg">No recent orders yet.</td></tr>}
                        </tbody>
                      </table>
                    )}
                 </div>
              </div>
           </section>

           <aside className="quick-actions">
              <h3>Quick Controls</h3>
              <div className="actions-stack">
                  {menus
                    .filter(m => ['Dashboard', 'Point of Sale', 'Product Management', 'Reports & Billing', 'Organization', 'Identity Master', 'Staff & Permissions', 'Hardware & Terminals', 'Terminal Management', 'Subscription'].includes(m.name))
                    .map((m, idx) => {
                      const style = getMenuIcon(m.name);
                      return (
                        <ActionCard 
                          key={idx}
                          title={m.name} 
                          desc={m.description} 
                          icon={style.icon} 
                          href={m.url} 
                          color={style.color} 
                        />
                      );
                    })
                  }
                  {menus.length === 0 && <p style={{ fontSize: '13px', color: '#94a3b8' }}>No actions authorized.</p>}
              </div>
           </aside>
        </div>

      {selectedOrder && (
        <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      <style jsx global>{`
        body { background: #f1f5f9; margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
      `}</style>

      <style jsx>{`
        .main-content { width: 100%; }
        
        .trial-alert {
           background: #fff7ed; border: 1px solid #ffedd5; padding: 16px 24px; border-radius: 16px;
           margin-bottom: 32px; display: flex; align-items: center; gap: 12px; color: #c2410c; font-size: 15px;
        }
        .alert-icon { font-size: 18px; }
        .trial-alert a { color: #f97316; font-weight: 700; text-decoration: underline; }

        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
        @media (max-width: 1200px) {
           .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
           .stats-grid { grid-template-columns: 1fr; gap: 12px; }
        }
        
        .dashboard-grid { display: grid; grid-template-columns: 1fr 340px; gap: 32px; }
        
        .section-card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; }
        .card-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; }
        .card-header h3 { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
        .view-link { font-size: 13px; font-weight: 700; color: #f97316; text-decoration: none; display: flex; align-items: center; gap: 6px; }

        .table-container { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th { text-align: left; padding: 16px 24px; background: #f8fafc; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .data-table td { padding: 16px 24px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; }
        .data-table tr:hover { background: #fcfcfc; cursor: pointer; }
        
        .id-badge { font-family: 'JetBrains Mono', monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; color: #475569; font-weight: 600; }
        .amount { font-weight: 700; color: #0f172a; }
        .row-btn { padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .row-btn:hover { background: #f97316; border-color: #f97316; color: white; }

        .status-pill { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
        .status-pill.new { background: #eff6ff; color: #2563eb; }
        .status-pill.completed { background: #ecfdf5; color: #059669; }
        .status-pill.in_progress { background: #fff7ed; color: #ea580c; }

        .quick-actions h3 { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 20px; }
        .actions-stack { display: flex; flex-direction: column; gap: 16px; }

        @media (max-width: 1024px) {
           .stats-grid { grid-template-columns: repeat(2, 1fr); }
           .dashboard-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
           .dashboard-grid { grid-template-columns: 1fr; }
           .quick-actions { margin-top: 24px; }
        }
      `}</style>
    </DashboardLayout>
  );
}

function StatCard({ label, value, icon, color, unit }) {
  return (
    <div className="stat-card">
      <div className="icon-box" style={{ background: `${color}10`, color: color }}>{icon}</div>
      <div className="stat-info">
         <span className="label">{label}</span>
         <div className="val-group">
            <span className="value">{value}</span>
            {unit && <span className="unit">{unit}</span>}
         </div>
      </div>
      <style jsx>{`
        .stat-card { background: white; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px; transition: transform 0.2s; }
        .stat-card:hover { transform: translateY(-4px); border-color: ${color}; }
        .icon-box { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
        .label { font-size: 12px; font-weight: 600; color: #64748b; }
        .value { display: block; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
        .unit { font-size: 11px; color: #94a3b8; font-weight: 500; margin-left: 4px; }
      `}</style>
    </div>
  );
}

function ActionCard({ title, desc, icon, href, color }) {
  return (
    <Link href={href} className="action-card">
      <div className="action-icon" style={{ color }}>{icon}</div>
      <div className="action-text">
         <h4>{title}</h4>
         <p>{desc}</p>
      </div>
      <FaArrowRight className="arrow" />
      <style jsx>{`
        .action-card { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px; text-decoration: none; transition: all 0.2s; }
        .action-card:hover { border-color: ${color}; transform: translateX(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .action-icon { font-size: 24px; }
        .action-text { flex: 1; }
        .action-text h4 { margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; }
        .action-text p { margin: 2px 0 0; font-size: 13px; color: #64748b; }
        .arrow { color: #cbd5e1; font-size: 12px; transition: transform 0.2s; }
        .action-card:hover .arrow { color: ${color}; transform: translateX(4px); }
      `}</style>
    </Link>
  );
}

function OrderDetailsModal({ order, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
           <h3>Order Details</h3>
           <button className="close-btn" onClick={onClose}><FaTimes /></button>
        </div>
        <div className="modal-body">
           <div className="info-grid">
              <div className="info-item">
                 <label>Order ID</label>
                 <span>#{order.id.substring(0,8)}</span>
              </div>
              <div className="info-item">
                 <label>Current Status</label>
                 <span className={`status-pill ${order.status.toLowerCase()}`}>{order.status}</span>
              </div>
           </div>
           <div className="total-box">
              <label>Bill Amount</label>
              <div className="total-val">{formatCurrency(order.totalAmount)}</div>
           </div>
        </div>
      </div>
      <style jsx>{`
        .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s; }
        .modal-content { background: white; width: 90%; max-width: 400px; border-radius: 24px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.2); }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h3 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
        .close-btn { background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; }
        .modal-body { padding: 32px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .info-item label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
        .info-item span { font-size: 16px; font-weight: 700; color: #1e293b; }
        .total-box { background: #f8fafc; padding: 20px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
        .total-box label { font-size: 13px; color: #64748b; font-weight: 600; }
        .total-val { font-size: 32px; font-weight: 900; color: #f97316; margin-top: 4px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
