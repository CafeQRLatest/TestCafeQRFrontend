// pages/owner/partners.js — ERP Partners Module (Customers & Vendors)
import React, { useState, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import CafeQRPopup from '../../components/CafeQRPopup';
import api from '../../utils/api';
import { isCustomersModuleEnabled } from '../../utils/moduleVisibility';
import {
  FaUserFriends, FaUsers, FaTruck, FaPlus, FaSearch, FaChevronRight,
  FaTimes, FaFileInvoice, FaTrash
} from 'react-icons/fa';

export default function PartnersPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Partners">
      <PartnersContent />
    </RoleGate>
  );
}

function PartnersContent() {
  const { notify, showConfirm } = useNotification();
  const [activeTab, setActiveTab] = useState('customers');
  const [config, setConfig] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pricelists, setPricelists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Edit states
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const customersEnabled = isCustomersModuleEnabled(config);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (config && !customersEnabled && activeTab === 'customers') {
      setActiveTab('vendors');
      setSelectedCustomer(null);
      setSearchTerm('');
      setStatusFilter('');
    }
  }, [activeTab, config, customersEnabled]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const configRes = await api.get('/api/v1/configurations').catch(() => null);
      const nextConfig = configRes?.data?.success ? (configRes.data.data || {}) : {};
      const shouldLoadCustomers = isCustomersModuleEnabled(nextConfig);
      setConfig(nextConfig);
      setActiveTab(shouldLoadCustomers ? 'customers' : 'vendors');

      const [custRes, vendRes, plRes] = await Promise.all([
        shouldLoadCustomers ? api.get('/api/v1/purchasing/customers') : Promise.resolve(null),
        api.get('/api/v1/purchasing/vendors'),
        api.get('/api/v1/purchasing/pricelists'),
      ]);
      if (custRes?.data?.success) setCustomers(custRes.data.data || []);
      if (!shouldLoadCustomers) setCustomers([]);
      if (vendRes.data.success) setVendors(vendRes.data.data || []);
      if (plRes.data.success) setPricelists(plRes.data.data || []);
    } catch (err) {
      notify('error', 'Failed to load partner data');
    } finally {
      setLoading(false);
    }
  };

  // === CUSTOMER CRUD ===
  const handleSaveCustomer = async () => {
    if (!selectedCustomer.name?.trim()) { notify('error', 'Name is required'); return; }
    setSaving(true);
    try {
      const isNew = !selectedCustomer.id;
      const url = isNew ? '/api/v1/purchasing/customers' : `/api/v1/purchasing/customers/${selectedCustomer.id}`;
      const resp = await (isNew ? api.post(url, selectedCustomer) : api.put(url, selectedCustomer));
      if (resp.data.success) {
        notify('success', isNew ? 'Customer created!' : 'Customer updated!');
        fetchAll();
        setSelectedCustomer(null);
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = (id, name) => {
    showConfirm({
      title: 'Delete Customer',
      message: `Are you sure you want to delete "${name}"?`,
      onConfirm: async () => {
        try {
          await api.delete(`/api/v1/purchasing/customers/${id}`);
          notify('success', 'Customer deleted');
          fetchAll();
        } catch (err) {
          notify('error', 'Failed to delete customer');
        }
      }
    });
  };

  // === VENDOR CRUD ===
  const handleSaveVendor = async () => {
    if (!selectedVendor.name?.trim()) { notify('error', 'Name is required'); return; }
    setSaving(true);
    try {
      const isNew = !selectedVendor.id;
      const url = isNew ? '/api/v1/purchasing/vendors' : `/api/v1/purchasing/vendors/${selectedVendor.id}`;
      const resp = await (isNew ? api.post(url, selectedVendor) : api.put(url, selectedVendor));
      if (resp.data.success) {
        notify('success', isNew ? 'Vendor created!' : 'Vendor updated!');
        fetchAll();
        setSelectedVendor(null);
      }
    } catch (err) {
      notify('error', err.response?.data?.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVendor = (id, name) => {
    showConfirm({
      title: 'Delete Vendor',
      message: `Are you sure you want to remove "${name}"?`,
      onConfirm: async () => {
        try {
          await api.delete(`/api/v1/purchasing/vendors/${id}`);
          notify('success', 'Vendor deleted');
          fetchAll();
        } catch (err) {
          notify('error', 'Failed to delete vendor');
        }
      }
    });
  };

  const startNewCustomer = () => setSelectedCustomer({
    name: '', phone: '', email: '', address: '', gstNumber: '', customerCategory: 'REGULAR',
    loyaltyPoints: 0, creditLimit: 0, openingBalance: 0, pricelistId: null, isActive: 'Y'
  });

  const startNewVendor = () => setSelectedVendor({
    name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '',
    openingBalance: 0, creditLimit: 0, pricelistId: null, isActive: 'Y'
  });

  const filteredCustomers = customers.filter(c =>
    (!statusFilter || (statusFilter === 'ACTIVE' ? c.isActive === 'Y' : c.isActive !== 'Y')) &&
    (c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone?.includes(searchTerm) || c.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredVendors = vendors.filter(v =>
    (!statusFilter || (statusFilter === 'ACTIVE' ? v.isActive === 'Y' : v.isActive !== 'Y')) &&
    (v.name?.toLowerCase().includes(searchTerm.toLowerCase()) || v.phone?.includes(searchTerm) || v.gstin?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) return <div className="loading-state"><span>Loading Partners...</span></div>;

  return (
    <DashboardLayout title="Partners" showBack={true}>
      <div className="erp-container">
        <div className="erp-main-card">
          <header className="erp-header">
            <div className="erp-tabs">
              {customersEnabled && (
                <button className={`erp-tab ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => { setActiveTab('customers'); setSearchTerm(''); setStatusFilter(''); }}>
                  <FaUsers style={{ marginRight: 6 }} /> Customers
                </button>
              )}
              <button className={`erp-tab ${activeTab === 'vendors' ? 'active' : ''}`} onClick={() => { setActiveTab('vendors'); setSearchTerm(''); setStatusFilter(''); }}>
                <FaTruck style={{ marginRight: 6 }} /> Vendors
              </button>
            </div>
            <div className="erp-actions">
              {activeTab === 'customers' ? (
                <button className="erp-btn primary" onClick={startNewCustomer}><FaPlus /> <span className="btn-label">New Customer</span></button>
              ) : (
                <button className="erp-btn primary" onClick={startNewVendor}><FaPlus /> <span className="btn-label">New Vendor</span></button>
              )}
            </div>
          </header>

          <div className="erp-filter-bar">
            <div className="erp-search-field">
              <FaSearch />
              <input placeholder={`Search ${activeTab}...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="erp-filters">
              <NiceSelect
                options={[{ value: '', label: 'All Status' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
          </div>

          {/* ═══════════ CUSTOMERS TABLE ═══════════ */}
          {activeTab === 'customers' && (
            <>
              <div className="erp-table-wrapper desk-only">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Category</th>
                      <th>Credit Limit</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map(c => (
                      <tr key={c.id} onClick={() => setSelectedCustomer(c)} className="clickable-row">
                        <td><span className="name-text">{c.name}</span></td>
                        <td>{c.phone || '—'}</td>
                        <td>{c.email || '—'}</td>
                        <td>
                          <span className={`type-badge ${c.customerCategory === 'VIP' ? 'egg' : c.customerCategory === 'WHOLESALE' ? 'non-veg' : 'veg'}`}>
                            {(c.customerCategory || 'REGULAR').toLowerCase()}
                          </span>
                        </td>
                        <td className="code-cell">₹{parseFloat(c.creditLimit || 0).toLocaleString()}</td>
                        <td className="code-cell">₹{parseFloat(c.openingBalance || 0).toLocaleString()}</td>
                        <td>
                          <span className={`status-pill ${c.isActive === 'Y' ? 'active' : 'inactive'}`}>
                            <span className="status-dot"></span>
                            {c.isActive === 'Y' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()} className="row-actions">
                          <button className="table-btn" onClick={() => setSelectedCustomer(c)} title="Edit"><FaChevronRight /></button>
                          <button className="table-btn delete" onClick={() => handleDeleteCustomer(c.id, c.name)} title="Delete"><FaTrash /></button>
                        </td>
                      </tr>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <tr>
                        <td colSpan={8} className="empty-state">
                          <div className="empty-icon"><FaUsers /></div>
                          <div className="empty-msg">No customers found</div>
                          <div className="empty-sub">Create your first customer to get started.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Mobile Cards */}
              <div className="erp-mobile-list mobile-only">
                {filteredCustomers.map(c => (
                  <div key={c.id} className="mobile-card" onClick={() => setSelectedCustomer(c)}>
                    <div className="card-avatar">{(c.name || '?')[0].toUpperCase()}</div>
                    <div className="card-info">
                      <span className="card-name">{c.name}</span>
                      <span className="card-sub">{c.phone || 'No phone'} • {(c.customerCategory || 'Regular').toLowerCase()}</span>
                    </div>
                    <div className="card-action"><FaChevronRight /></div>
                  </div>
                ))}
                {filteredCustomers.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No customers found.</div>}
              </div>
            </>
          )}

          {/* ═══════════ VENDORS TABLE ═══════════ */}
          {activeTab === 'vendors' && (
            <>
              <div className="erp-table-wrapper desk-only">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Company Name</th>
                      <th>Contact Person</th>
                      <th>Phone</th>
                      <th>GSTIN</th>
                      <th>Credit Limit</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVendors.map(v => (
                      <tr key={v.id} onClick={() => setSelectedVendor(v)} className="clickable-row">
                        <td><span className="name-text">{v.name}</span></td>
                        <td>{v.contactPerson || '—'}</td>
                        <td>{v.phone || '—'}</td>
                        <td><span className="code-cell">{v.gstin || '—'}</span></td>
                        <td className="code-cell">₹{parseFloat(v.creditLimit || 0).toLocaleString()}</td>
                        <td className="code-cell">₹{parseFloat(v.openingBalance || 0).toLocaleString()}</td>
                        <td>
                          <span className={`status-pill ${v.isActive === 'Y' ? 'active' : 'inactive'}`}>
                            <span className="status-dot"></span>
                            {v.isActive === 'Y' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()} className="row-actions">
                          <button className="table-btn" onClick={() => setSelectedVendor(v)} title="Edit"><FaChevronRight /></button>
                          <button className="table-btn delete" onClick={() => handleDeleteVendor(v.id, v.name)} title="Delete"><FaTrash /></button>
                        </td>
                      </tr>
                    ))}
                    {filteredVendors.length === 0 && (
                      <tr>
                        <td colSpan={8} className="empty-state">
                          <div className="empty-icon"><FaTruck /></div>
                          <div className="empty-msg">No vendors found</div>
                          <div className="empty-sub">Add your first vendor to get started.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Mobile Cards */}
              <div className="erp-mobile-list mobile-only">
                {filteredVendors.map(v => (
                  <div key={v.id} className="mobile-card" onClick={() => setSelectedVendor(v)}>
                    <div className="card-avatar vendor">{(v.name || '?')[0].toUpperCase()}</div>
                    <div className="card-info">
                      <span className="card-name">{v.name}</span>
                      <span className="card-sub">{v.contactPerson || 'No contact'} • {v.phone || ''}</span>
                    </div>
                    <div className="card-action"><FaChevronRight /></div>
                  </div>
                ))}
                {filteredVendors.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No vendors found.</div>}
              </div>
            </>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════════════════ */}
        {/* CUSTOMER EDIT POPUP                                                            */}
        {/* ════════════════════════════════════════════════════════════════════════════════ */}
        {customersEnabled && selectedCustomer && (
          <CafeQRPopup
            title={selectedCustomer.id ? 'Edit Customer' : 'New Customer'}
            onClose={() => setSelectedCustomer(null)}
            onSave={handleSaveCustomer}
            saveLabel={selectedCustomer.id ? 'Update Customer' : 'Create Customer'}
            isSaving={saving}
            icon={FaUsers}
            maxWidth="700px"
          >
            <div className="drawer-form">
              <div className="erp-section">
                <div className="section-title"><FaUsers /> Contact Information</div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Full Name *</label>
                    <input value={selectedCustomer.name} onChange={e => setSelectedCustomer({...selectedCustomer, name: e.target.value})} placeholder="Customer name" />
                  </div>
                  <div className="input-group">
                    <label>Phone</label>
                    <input value={selectedCustomer.phone || ''} onChange={e => setSelectedCustomer({...selectedCustomer, phone: e.target.value})} placeholder="+91 9876543210" />
                  </div>
                </div>
                <div className="input-row" style={{ marginTop: 16 }}>
                  <div className="input-group">
                    <label>Email</label>
                    <input type="email" value={selectedCustomer.email || ''} onChange={e => setSelectedCustomer({...selectedCustomer, email: e.target.value})} placeholder="email@example.com" />
                  </div>
                  <div className="input-group">
                    <label>GST Number</label>
                    <input value={selectedCustomer.gstNumber || ''} onChange={e => setSelectedCustomer({...selectedCustomer, gstNumber: e.target.value})} placeholder="22AAAAA0000A1Z5" />
                  </div>
                </div>
                <div className="input-group" style={{ marginTop: 16 }}>
                  <label>Address</label>
                  <textarea value={selectedCustomer.address || ''} onChange={e => setSelectedCustomer({...selectedCustomer, address: e.target.value})} placeholder="Full address" rows={2} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, resize: 'vertical', fontSize: 13, color: '#0f172a' }} />
                </div>
              </div>

              <div className="erp-section">
                <div className="section-title"><FaFileInvoice /> Financial Details</div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Category</label>
                    <NiceSelect
                      options={[{ value: 'REGULAR', label: 'Regular' }, { value: 'WHOLESALE', label: 'Wholesale' }, { value: 'VIP', label: 'VIP' }, { value: 'CORPORATE', label: 'Corporate' }]}
                      value={selectedCustomer.customerCategory || 'REGULAR'}
                      onChange={val => setSelectedCustomer({...selectedCustomer, customerCategory: val})}
                    />
                  </div>
                  <div className="input-group">
                    <label>Loyalty Points</label>
                    <input type="number" value={selectedCustomer.loyaltyPoints || 0} onChange={e => setSelectedCustomer({...selectedCustomer, loyaltyPoints: parseInt(e.target.value) || 0})} />
                  </div>
                </div>
                <div className="input-row" style={{ marginTop: 16 }}>
                  <div className="input-group">
                    <label>Credit Limit</label>
                    <input type="number" value={selectedCustomer.creditLimit || 0} onChange={e => setSelectedCustomer({...selectedCustomer, creditLimit: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div className="input-group">
                    <label>Opening Balance</label>
                    <input type="number" value={selectedCustomer.openingBalance || 0} onChange={e => setSelectedCustomer({...selectedCustomer, openingBalance: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>
                <div className="input-row" style={{ marginTop: 16 }}>
                  <div className="input-group">
                    <label>Sale Price List</label>
                    <NiceSelect
                      options={[{ value: '', label: 'None' }, ...pricelists.filter(p => p.pricelistType === 'SALE').map(p => ({ value: p.id, label: p.name }))]}
                      value={selectedCustomer.pricelistId || ''}
                      onChange={val => setSelectedCustomer({...selectedCustomer, pricelistId: val || null})}
                    />
                  </div>
                  <div className="input-group">
                    <label>Status</label>
                    <div className="control-row">
                      <label>Active</label>
                      <div className={`erp-switch ${selectedCustomer.isActive === 'Y' ? 'active' : ''}`} onClick={() => setSelectedCustomer({...selectedCustomer, isActive: selectedCustomer.isActive === 'Y' ? 'N' : 'Y'})}>
                        <div className="switch-knob"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CafeQRPopup>
        )}

        {/* ════════════════════════════════════════════════════════════════════════════════ */}
        {/* VENDOR EDIT POPUP                                                              */}
        {/* ════════════════════════════════════════════════════════════════════════════════ */}
        {selectedVendor && (
          <CafeQRPopup
            title={selectedVendor.id ? 'Edit Vendor' : 'New Vendor'}
            onClose={() => setSelectedVendor(null)}
            onSave={handleSaveVendor}
            saveLabel={selectedVendor.id ? 'Update Vendor' : 'Create Vendor'}
            isSaving={saving}
            icon={FaTruck}
            maxWidth="700px"
          >
            <div className="drawer-form">
              <div className="erp-section">
                <div className="section-title"><FaTruck /> Vendor Information</div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Company Name *</label>
                    <input value={selectedVendor.name} onChange={e => setSelectedVendor({...selectedVendor, name: e.target.value})} placeholder="Vendor company name" />
                  </div>
                  <div className="input-group">
                    <label>Contact Person</label>
                    <input value={selectedVendor.contactPerson || ''} onChange={e => setSelectedVendor({...selectedVendor, contactPerson: e.target.value})} placeholder="Contact person name" />
                  </div>
                </div>
                <div className="input-row" style={{ marginTop: 16 }}>
                  <div className="input-group">
                    <label>Phone</label>
                    <input value={selectedVendor.phone || ''} onChange={e => setSelectedVendor({...selectedVendor, phone: e.target.value})} placeholder="+91 9876543210" />
                  </div>
                  <div className="input-group">
                    <label>Email</label>
                    <input type="email" value={selectedVendor.email || ''} onChange={e => setSelectedVendor({...selectedVendor, email: e.target.value})} placeholder="vendor@company.com" />
                  </div>
                </div>
                <div className="input-group" style={{ marginTop: 16 }}>
                  <label>GSTIN</label>
                  <input value={selectedVendor.gstin || ''} onChange={e => setSelectedVendor({...selectedVendor, gstin: e.target.value})} placeholder="22AAAAA0000A1Z5" />
                </div>
                <div className="input-group" style={{ marginTop: 16 }}>
                  <label>Address</label>
                  <textarea value={selectedVendor.address || ''} onChange={e => setSelectedVendor({...selectedVendor, address: e.target.value})} placeholder="Full address" rows={2} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, resize: 'vertical', fontSize: 13, color: '#0f172a' }} />
                </div>
              </div>

              <div className="erp-section">
                <div className="section-title"><FaFileInvoice /> Financial Details</div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Credit Limit</label>
                    <input type="number" value={selectedVendor.creditLimit || 0} onChange={e => setSelectedVendor({...selectedVendor, creditLimit: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div className="input-group">
                    <label>Opening Balance</label>
                    <input type="number" value={selectedVendor.openingBalance || 0} onChange={e => setSelectedVendor({...selectedVendor, openingBalance: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>
                <div className="input-row" style={{ marginTop: 16 }}>
                  <div className="input-group">
                    <label>Purchase Price List</label>
                    <NiceSelect
                      options={[{ value: '', label: 'None' }, ...pricelists.filter(p => p.pricelistType === 'PURCHASE').map(p => ({ value: p.id, label: p.name }))]}
                      value={selectedVendor.pricelistId || ''}
                      onChange={val => setSelectedVendor({...selectedVendor, pricelistId: val || null})}
                    />
                  </div>
                  <div className="input-group">
                    <label>Status</label>
                    <div className="control-row">
                      <label>Active</label>
                      <div className={`erp-switch ${selectedVendor.isActive === 'Y' ? 'active' : ''}`} onClick={() => setSelectedVendor({...selectedVendor, isActive: selectedVendor.isActive === 'Y' ? 'N' : 'Y'})}>
                        <div className="switch-knob"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CafeQRPopup>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════════════ */}
      {/* EMBEDDED STYLES (same design system as product-management.js)                      */}
      {/* ═══════════════════════════════════════════════════════════════════════════════════ */}
      <style jsx>{`
        .erp-container { padding: 24px 40px; background: #f8fafc; min-height: calc(100vh - 80px); }
        .erp-main-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .erp-header { padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; background: #fff; border-radius: 20px 20px 0 0; }
        .erp-tabs { display: flex; gap: 8px; background: #f1f5f9; padding: 4px; border-radius: 10px; }
        .erp-tab { padding: 6px 14px; border: none; background: none; font-weight: 600; color: #64748b; cursor: pointer; border-radius: 8px; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; }
        .erp-tab.active { background: white; color: #FF7A00; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .erp-tab:hover:not(.active) { color: #0f172a; }

        .erp-filter-bar { padding: 12px 24px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #f1f5f9; background: #fff; }
        .erp-search-field { flex: 1; max-width: 320px; position: relative; display: flex; align-items: center; background: #f8fafc; border-radius: 10px; padding: 0 14px; border: 1px solid #e2e8f0; height: 40px; }
        .erp-search-field svg { color: #94a3b8; font-size: 14px; margin-right: 10px; flex-shrink: 0; }
        .erp-search-field input { border: none; background: transparent; font-size: 13px; font-weight: 500; color: #0f172a; width: 100%; outline: none; height: 100%; }
        .erp-search-field input::placeholder { color: #94a3b8; }
        .erp-filters { display: flex; align-items: center; gap: 12px; }

        .erp-table-wrapper { overflow-x: auto; }
        .erp-table { width: 100%; border-collapse: collapse; }
        .erp-table th { text-align: left; padding: 14px 16px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #FF7A00; background: #fff; }
        .erp-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569; vertical-align: middle; }
        .clickable-row { cursor: pointer; transition: background 0.15s; }
        .clickable-row:hover { background: #fffbf5; }
        .name-text { font-weight: 600; color: #0f172a; }
        .code-cell { font-family: 'Inter', monospace; color: #64748b; font-weight: 500; font-size: 12px; }

        .type-badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: capitalize; }
        .type-badge.veg { background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; }
        .type-badge.non-veg { background: #fef2f2; color: #991b1b; border: 1px solid #fee2e2; }
        .type-badge.egg { background: #fffbeb; color: #b45309; border: 1px solid #fef3c7; }

        .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }
        .status-pill.active { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
        .status-pill.inactive { background: #fef2f2; color: #ef4444; border-color: #fee2e2; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill.active .status-dot { background: #22c55e; }
        .status-pill.inactive .status-dot { background: #ef4444; }

        .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
        .table-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; transition: all 0.2s; }
        .table-btn:hover { background: #fff7ed; color: #FF7A00; border-color: #fed7aa; }
        .table-btn.delete:hover { background: #fef2f2; color: #ef4444; border-color: #fecaca; }
        .text-right { text-align: right; }

        .empty-state { text-align: center; padding: 60px 20px !important; }
        .empty-icon { font-size: 36px; color: #e2e8f0; margin-bottom: 16px; }
        .empty-msg { font-size: 16px; font-weight: 700; color: #475569; margin-bottom: 4px; }
        .empty-sub { font-size: 13px; color: #94a3b8; }

        .drawer-form { display: flex; flex-direction: column; gap: 20px; }
        .erp-section { background: #fcfdfe; padding: 16px; border-radius: 12px; border: 1px solid #f1f5f9; }
        .section-title { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 16px; text-transform: uppercase; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }
        .input-group input, .input-group textarea { padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; color: #0f172a; }
        .input-group input:focus { border-color: #FF7A00; outline: none; box-shadow: 0 0 0 3px rgba(255,122,0,0.08); }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .control-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #fcfdfe; border: 1px solid #f1f5f9; border-radius: 10px; margin-top: 10px; }
        .control-row label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0; }
        .erp-switch { width: 44px; height: 24px; background: #cbd5e1; border-radius: 100px; position: relative; cursor: pointer; transition: all 0.3s; }
        .erp-switch.active { background: #FF7A00; }
        .switch-knob { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .erp-switch.active .switch-knob { left: calc(100% - 21px); }

        .erp-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .erp-btn.primary { background: #FF7A00; color: white; box-shadow: 0 2px 4px rgba(255, 122, 0, 0.2); }
        .erp-btn.primary:hover { background: #ea580c; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(255, 122, 0, 0.25); }
        .erp-actions { display: flex; align-items: center; gap: 12px; }

        .card-avatar { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #FF7A00, #fb923c); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; }
        .card-avatar.vendor { background: linear-gradient(135deg, #3b82f6, #60a5fa); }

        .loading-state { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #0f172a; font-size: 18px; background: #f8fafc; }

        .mobile-only { display: none; }
        @media (max-width: 768px) {
          .erp-container { padding: 12px; }
          .desk-only { display: none; }
          .mobile-only { display: block; }
          .erp-header { padding: 16px; flex-direction: column; gap: 16px; align-items: stretch; border-radius: 20px 20px 0 0; }
          .erp-actions { flex-direction: row; flex-wrap: nowrap; gap: 8px; justify-content: space-between; }
          .erp-actions button { flex: 1; padding: 12px !important; min-width: 0; display: flex; align-items: center; justify-content: center; }
          .btn-label { display: none; }
          .erp-tabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
          .erp-tabs::-webkit-scrollbar { display: none; }
          .erp-tabs button { flex-shrink: 0; }
          .erp-filter-bar { padding: 12px 16px; flex-direction: column; align-items: stretch; }
          .erp-search-field { max-width: none; }
          .erp-mobile-list { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
          .mobile-card { background: white; border: 1px solid #f1f5f9; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.15s; }
          .mobile-card:active { background: #fffbf5; }
          .card-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
          .card-name { font-size: 14px; font-weight: 600; color: #0f172a; }
          .card-sub { font-size: 12px; color: #64748b; font-weight: 500; }
          .card-action { color: #94a3b8; font-size: 12px; }
          .input-row { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
