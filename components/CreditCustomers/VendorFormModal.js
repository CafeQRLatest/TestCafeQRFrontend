import React from 'react';

export default function VendorFormModal({
  open,
  editing,
  form,
  setForm,
  saving,
  saveVendor,
  setFormOpen,
  SYM,
}) {
  if (!open) return null;

  return (
    <div className="rpt-modal-overlay" onMouseDown={() => setFormOpen(false)}>
      <div className="rpt-modal" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: '540px' }}>
        <h2 className="modal-title">{editing ? 'Edit Credit Vendor' : 'Create New Credit Vendor'}</h2>
        <div className="modal-form">
          <div className="form-group">
            <label>Vendor / Company Name *</label>
            <input 
              className="form-input"
              value={form.name} 
              onChange={(event) => setForm({ ...form, name: event.target.value })} 
              placeholder="e.g. Acme Supplies Ltd"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Contact Person</label>
              <input 
                className="form-input"
                value={form.contactPerson} 
                onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} 
                placeholder="e.g. Robert Smith"
              />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input 
                className="form-input"
                value={form.phone} 
                onChange={(event) => setForm({ ...form, phone: event.target.value })} 
                placeholder="e.g. 9876543210"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email Address</label>
              <input 
                className="form-input"
                type="email"
                value={form.email} 
                onChange={(event) => setForm({ ...form, email: event.target.value })} 
                placeholder="e.g. vendor@example.com"
              />
            </div>
            <div className="form-group">
              <label>GSTIN / Tax ID</label>
              <input 
                className="form-input"
                value={form.gstin} 
                onChange={(event) => setForm({ ...form, gstin: event.target.value })} 
                placeholder="e.g. 32AAAAA0000A1Z5"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Credit Limit ({SYM})</label>
              <input 
                className="form-input"
                type="number" 
                value={form.creditLimit} 
                onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} 
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label>Opening Balance ({SYM})</label>
              <input 
                className="form-input"
                type="number" 
                value={form.openingBalance} 
                onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} 
                placeholder="0"
                disabled={!!editing}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Address</label>
            <textarea 
              className="form-input"
              rows="2"
              value={form.address} 
              onChange={(event) => setForm({ ...form, address: event.target.value })} 
              placeholder="Vendor address details..."
            />
          </div>
        </div>
        <div className="modal-actions">
          <button 
            type="button" 
            className="rpt-modal-btn rpt-modal-btn-outline" 
            onClick={() => setFormOpen(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="primary" 
            onClick={saveVendor}
            disabled={saving || !form.name.trim()}
          >
            {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Save Vendor')}
          </button>
        </div>
      </div>
    </div>
  );
}
