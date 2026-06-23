import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import NiceSelect from '../../components/NiceSelect';
import PremiumTimeSelect from '../../components/PremiumTimeSelect';
import CafeQRPopup from '../../components/CafeQRPopup';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import {
  FaChair, FaPlus, FaTimes, FaSearch, FaEdit, FaTrash,
  FaCheckCircle, FaExclamationCircle, FaSave, FaUsers,
  FaLayerGroup, FaCog, FaStickyNote, FaQrcode,
  FaCheck, FaUser, FaClock, FaTools
} from 'react-icons/fa';

const STATUS_CFG = {
  AVAILABLE:   { label:'Available',   color:'#64748b', bg:'#ffffff', dot:'#cbd5e1' },
  OCCUPIED:    { label:'Occupied',    color:'#ef4444', bg:'#fef2f2', dot:'#ef4444' },
  RESERVED:    { label:'Reserved',    color:'#3b82f6', bg:'#eff6ff', dot:'#3b82f6' },
  MAINTENANCE: { label:'Hold',        color:'#64748b', bg:'#f1f5f9', dot:'#64748b' },
};

const DEFAULT_SHAPES = ['Square','Round','Rectangle','Booth','Bar Seat'];
const DEFAULT_FLOORS = ['Main','1st Floor','2nd Floor','Terrace','Rooftop'];
const DEFAULT_SECTIONS = ['Indoor','Outdoor','VIP','Garden','Poolside'];

const LS_KEYS = { floors:'tm_floors', sections:'tm_sections', shapes:'tm_shapes' };

function loadList(key, defaults) {
  if (typeof window === 'undefined') return defaults;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : defaults; } catch { return defaults; }
}
function saveList(key, list) {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(list));
}

export default function TableManagementPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Table Management">
      <ModuleGate>
        <TableContent />
      </ModuleGate>
    </RoleGate>
  );
}

function TableContent() {
  const { orgId } = useAuth();
  const [tables, setTables] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [floorFilter, setFloorFilter] = useState('ALL');
  const [editing, setEditing] = useState(null);
  const [reserving, setReserving] = useState(null);
  const [toast, setToast] = useState(null);

  // Custom lists state
  const [floorsList, setFloorsList] = useState(() => loadList(LS_KEYS.floors, DEFAULT_FLOORS));
  const [sectionsList, setSectionsList] = useState(() => loadList(LS_KEYS.sections, DEFAULT_SECTIONS));
  const [shapesList, setShapesList] = useState(() => loadList(LS_KEYS.shapes, DEFAULT_SHAPES));
  const [managePanel, setManagePanel] = useState(null); // 'floors' | 'sections' | 'shapes' | null
  const [newItemText, setNewItemText] = useState('');
  const [inlineAdd, setInlineAdd] = useState(null); // 'floor' | 'section' | 'shape' | null
  const [inlineText, setInlineText] = useState('');
  const [confirmModal, setConfirmModal] = useState(null); // { title, msg, onOk, icon } | null
  const isAllBranches = !orgId;

  // Persist lists on change
  useEffect(() => { saveList(LS_KEYS.floors, floorsList); }, [floorsList]);
  useEffect(() => { saveList(LS_KEYS.sections, sectionsList); }, [sectionsList]);
  useEffect(() => { saveList(LS_KEYS.shapes, shapesList); }, [shapesList]);

  const addToList = (type) => {
    const val = newItemText.trim();
    if (!val) return;
    if (type === 'floors' && !floorsList.includes(val)) setFloorsList([...floorsList, val]);
    if (type === 'sections' && !sectionsList.includes(val)) setSectionsList([...sectionsList, val]);
    if (type === 'shapes' && !shapesList.includes(val)) setShapesList([...shapesList, val]);
    setNewItemText('');
  };
  const removeFromList = (type, item) => {
    if (type === 'floors') setFloorsList(floorsList.filter(i => i !== item));
    if (type === 'sections') setSectionsList(sectionsList.filter(i => i !== item));
    if (type === 'shapes') setShapesList(shapesList.filter(i => i !== item));
  };
  const handleInlineAdd = (field) => {
    const val = inlineText.trim();
    if (!val) { setInlineAdd(null); return; }
    if (field === 'floor' && !floorsList.includes(val)) setFloorsList([...floorsList, val]);
    if (field === 'section' && !sectionsList.includes(val)) setSectionsList([...sectionsList, val]);
    if (field === 'shape' && !shapesList.includes(val)) setShapesList([...shapesList, val]);
    setEditing(prev => ({ ...prev, [field]: val }));
    setInlineAdd(null);
    setInlineText('');
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchTables = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get('/api/v1/tables/active');
      if (r.data.success) setTables(r.data.data || []);
    } catch {
      showToast('Failed to load tables', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEditing(null);
    setReserving(null);
    setConfirmModal(null);
    setSearch('');
    setStatusFilter('ALL');
    setFloorFilter('ALL');
    fetchTables();
  }, [fetchTables, orgId]);

  useEffect(() => {
    if (!isAllBranches) {
      setBranches([]);
      return;
    }

    let alive = true;
    api.get('/api/v1/organizations')
      .then((resp) => {
        if (alive && resp.data?.success) {
          setBranches(resp.data.data || []);
        }
      })
      .catch(() => {
        if (alive) setBranches([]);
      });

    return () => {
      alive = false;
    };
  }, [isAllBranches]);

  const handleSave = async () => {
    if (!editing?.tableNumber?.trim()) {
      showToast('Table number is required', 'error');
      return;
    }
    if (isAllBranches && !editing?.orgId) {
      showToast('Select a branch for this table', 'error');
      return;
    }
    setSaving(true);
    try {
      const isNew = !editing.id;
      if (isNew && editing.createMultiple && editing.tableCount > 1) {
        const prefix = editing.tableNumber.replace(/[0-9]+$/, '');
        const baseNum = parseInt(editing.tableNumber.replace(/[^0-9]/g, '')) || 1;
        for (let i = 0; i < editing.tableCount; i++) {
          const newNum = prefix ? `${prefix}${baseNum + i}` : `${baseNum + i}`;
          await api.post('/api/v1/tables', { ...editing, orgId: editing.orgId || orgId, tableNumber: newNum });
        }
        showToast(`${editing.tableCount} tables created!`);
      } else {
        const url = isNew ? '/api/v1/tables' : `/api/v1/tables/${editing.id}`;
        const payload = isNew ? { ...editing, orgId: editing.orgId || orgId } : editing;
        const r = await (isNew ? api.post(url, payload) : api.put(url, payload));
        if (r.data.success) {
          showToast(isNew ? 'Table created!' : 'Table updated!');
        }
      }
      setEditing(null);
      fetchTables();
    } catch (e) {
      showToast(e.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({
      title: 'Delete Table',
      msg: 'Are you sure you want to permanently delete this table? This action cannot be undone.',
      icon: FaTrash,
      onOk: async () => {
        try {
          await api.delete(`/api/v1/tables/${id}`);
          showToast('Table deleted');
          fetchTables();
        } catch { showToast('Delete failed', 'error'); }
        setConfirmModal(null);
      }
    });
  };

  const toggleStatus = (t) => {
    const keys = Object.keys(STATUS_CFG);
    const currentIdx = keys.indexOf(t.status || 'AVAILABLE');
    const nextStatus = keys[(currentIdx + 1) % keys.length];
    handleStatusChange(t.id, nextStatus);
  };

  const handleStatusChange = async (id, status, details = null) => {
    if (status === 'RESERVED' && !details) {
      const table = tables.find(t => t.id === id);
      let existingDetails = { note: '', time: '', guests: table.seatingCapacity };
      if (table.notes) {
        try { existingDetails = JSON.parse(table.notes); } catch(e) {}
      }
      setReserving({ ...table, resDetails: existingDetails });
      return;
    }

    const table = tables.find(t => t.id === id);
    if (table.status === 'RESERVED' && status !== 'RESERVED') {
      setConfirmModal({
        title: 'Clear Reservation?',
        msg: `Table ${table.tableNumber} is currently RESERVED. Changing status will clear all reservation details. Continue?`,
        icon: FaExclamationCircle,
        onOk: () => performStatusUpdate(id, status, null, true)
      });
      return;
    }

    performStatusUpdate(id, status, details);
  };

  const performStatusUpdate = async (id, status, details = null, clearNotes = false) => {
    try {
      if (status === 'RESERVED' && details) {
        const table = tables.find(t => t.id === id);
        await api.put(`/api/v1/tables/${id}`, { ...table, status: 'RESERVED', notes: JSON.stringify(details) });
      } else {
        const payload = { status: status };
        if (clearNotes) {
          const table = tables.find(t => t.id === id);
          await api.put(`/api/v1/tables/${id}`, { ...table, status, notes: null });
        } else {
          await api.patch(`/api/v1/tables/${id}/status?status=${status}`);
        }
      }
      setReserving(null);
      setConfirmModal(null);
      fetchTables();
    } catch {
      showToast('Status update failed', 'error');
    }
  };

  const handleSendQR = async (t) => {
    try {
      const qrLink = `${window.location.origin}/menu/${t.clientId}/${t.orgId}/${t.id}`;
      // Backend will automatically use the logged-in user's email if 'email' param is missing
      await api.post(`/api/v1/tables/${t.id}/send-qr?qrLink=${encodeURIComponent(qrLink)}`);
      showToast(`QR Code access link sent to your registered email`);
    } catch {
      showToast('Failed to send QR email', 'error');
    }
  };

  const startNew = () => setEditing({
    tableNumber: '', name: '', seatingCapacity: 4, floor: 'Main', section: '',
    shape: 'SQUARE', status: 'AVAILABLE', notes: '', displayOrder: 0, isactive: 'Y',
    orgId: orgId || ''
  });

  const floors = ['ALL', ...new Set([...floorsList, ...tables.map(t => t.floor).filter(Boolean)])];
  const sections = ['ALL', ...new Set([...sectionsList, ...tables.map(t => t.section).filter(Boolean)])];

  const filtered = tables.filter(t => {
    const ms = !search || 
               (t.tableNumber || '').toLowerCase().includes(search.toLowerCase()) || 
               (t.name || '').toLowerCase().includes(search.toLowerCase());
    const mst = statusFilter === 'ALL' || t.status === statusFilter;
    const mf = floorFilter === 'ALL' || t.floor === floorFilter;
    return ms && mst && mf;
  });

  const currentList = managePanel === 'floors' ? floorsList : managePanel === 'sections' ? sectionsList : shapesList;
  const currentTitle = managePanel === 'floors' ? 'Floors' : managePanel === 'sections' ? 'Sections' : 'Shapes';

  return (
    <DashboardLayout title="Table Management" showBack={false}>
      {loading ? (
        <div className="tl">
          <div className="tsp" />
          <span>Loading tables...</span>
        </div>
      ) : (
        <div className="tm">
          {/* Reservation Modal */}
          {reserving && (
            <div className="modal-ov" onClick={() => setReserving(null)}>
              <div className="modal-card" onClick={e => e.stopPropagation()}>
                <div className="modal-hd">
                  <h3><FaClock /> Table {reserving.tableNumber} Reservation</h3>
                  <button className="modal-x" onClick={() => setReserving(null)}><FaTimes /></button>
                </div>
                <div className="modal-body">
                  <div className="fg">
                    <label>Reservation Note</label>
                    <textarea 
                      placeholder="e.g. Birthday celebration, window seat preferred..." 
                      value={reserving.resDetails.note} 
                      onChange={e => setReserving({...reserving, resDetails: {...reserving.resDetails, note: e.target.value}})}
                      rows={3}
                    />
                  </div>
                  <div className="fg-row">
                    <div className="fg">
                      <label>Time</label>
                      <PremiumTimeSelect 
                        value={reserving.resDetails.time} 
                        onChange={e => setReserving({...reserving, resDetails: {...reserving.resDetails, time: e.target.value}})}
                      />
                    </div>
                    <div className="fg">
                      <label>Guests</label>
                      <input 
                        type="number" 
                        value={reserving.resDetails.guests} 
                        onChange={e => setReserving({...reserving, resDetails: {...reserving.resDetails, guests: e.target.value}})}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-ft">
                  <button className="modal-cancel" onClick={() => setReserving(null)}>Cancel</button>
                  <button className="modal-save" onClick={() => handleStatusChange(reserving.id, 'RESERVED', reserving.resDetails)}>
                    Confirm Reservation
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="tm-toolbar">
            <div className="tm-top-row">
              <div className="tm-master-actions">
                <button className="tm-btn-master" onClick={() => setManagePanel('floors')}><FaLayerGroup/> Floors</button>
                <button className="tm-btn-master" onClick={() => setManagePanel('sections')}><FaChair/> Sections</button>
                <button className="tm-btn-master" onClick={() => setManagePanel('shapes')}><FaStickyNote/> Shapes</button>
              </div>
              <button className="tm-add" onClick={startNew}><FaPlus /> Add Table</button>
            </div>

            <div className="tm-filter-row">
              <div className="tm-search">
                <FaSearch className="tm-si" />
                <input placeholder="Search tables..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              
              <div className="tm-dropdowns">
                <NiceSelect 
                  options={floors.map(f => ({ value: f, label: f === 'ALL' ? 'All Floors' : f }))}
                  value={floorFilter} 
                  onChange={setFloorFilter} 
                />
              </div>

              <div className="tm-filters-modern">
                <div className="status-carousel">
                  {[{ value: 'ALL', label: 'All Tables' }, ...Object.entries(STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))].map(s => (
                    <button 
                      key={s.value} 
                      className={`status-chip ${statusFilter === s.value ? 'active' : ''}`}
                      onClick={() => setStatusFilter(s.value)}
                    >
                      {s.value !== 'ALL' && <span className="status-dot" style={{ background: STATUS_CFG[s.value]?.dot }} />}
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Table Grid Content */}
          {filtered.length === 0 ? (
            <div className="tm-empty">
              <FaChair className="tme-ic" />
              <p>No tables found</p>
            </div>
          ) : (
            <div className="tm-grid">
              {filtered.map(t => {
                const st = STATUS_CFG[t.status] || STATUS_CFG.AVAILABLE;
                return (
                  <div key={t.id} className={`tbl-card ${t.status.toLowerCase()}`}>
                    <div className="tbl-top">
                      <div className="tbl-num-box">
                        <span className="tbl-num">{t.tableNumber}</span>
                        {t.name && <span className="tbl-name-pill">{t.name}</span>}
                      </div>
                      <div className="tbl-top-actions">
                        <button className="top-act-btn qr" onClick={(e) => { e.stopPropagation(); handleSendQR(t); }} title="Send QR / SMS"><FaQrcode /></button>
                        <button className="top-act-btn edit" onClick={(e) => { e.stopPropagation(); setEditing({ ...t }); }} title="Edit"><FaEdit /></button>
                        <button className="top-act-btn del" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} title="Delete"><FaTrash /></button>
                      </div>
                    </div>
                    <div className="tbl-meta-row">
                      <div className="tm-meta-item" title="Seating Capacity">
                        <FaUsers className="tbl-mi" /> {t.seatingCapacity} Seats
                      </div>
                      <div className="tm-meta-item" title="Location">
                        <FaLayerGroup className="tbl-mi" /> {t.floor}{t.section && `/${t.section}`}
                      </div>
                    </div>
                    {t.status === 'RESERVED' && t.notes && (() => {
                      let d = { note: '', time: '', guests: 0 };
                      try { d = JSON.parse(t.notes); } catch(e) { 
                        return <div className="res-details-box"><div className="res-info-raw">{t.notes}</div></div>; 
                      }
                      return (
                        <div className="res-details-box">
                          <div className="res-header">
                            <span className="rh-title">DETAILS</span>
                            <div className="rh-meta">
                              {d.time && <span className="rh-time"><FaClock /> {d.time}</span>}
                              <span className="rh-guests"><FaUsers /> {d.guests}</span>
                            </div>
                          </div>
                          <div className="res-info">
                            <span className="res-note">{d.note || 'No notes'}</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="tbl-status-grid">
                      <button className={`ts-btn available ${t.status === 'AVAILABLE' ? 'active' : ''}`} onClick={() => handleStatusChange(t.id, 'AVAILABLE')}>
                        <FaCheck className="ts-btn-i" /> <span>Available</span>
                      </button>
                      <button className={`ts-btn occupied ${t.status === 'OCCUPIED' ? 'active' : ''}`} onClick={() => handleStatusChange(t.id, 'OCCUPIED')}>
                        <FaUser className="ts-btn-i" /> <span>Occupied</span>
                      </button>
                      <button className={`ts-btn reserved ${t.status === 'RESERVED' ? 'active' : ''}`} onClick={() => handleStatusChange(t.id, 'RESERVED')}>
                        <FaClock className="ts-btn-i" /> <span>Reserved</span>
                      </button>
                      <button className={`ts-btn maintenance ${t.status === 'MAINTENANCE' ? 'active' : ''}`} onClick={() => handleStatusChange(t.id, 'MAINTENANCE')}>
                        <FaTools className="ts-btn-i" /> <span>Hold</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirmation Modal */}
      {confirmModal && (
        <CafeQRPopup
          title={confirmModal.title}
          icon={confirmModal.icon}
          onClose={() => setConfirmModal(null)}
          onCancel={() => setConfirmModal(null)}
          onSave={confirmModal.onOk}
          saveLabel="Confirm"
          cancelLabel="Cancel"
          maxWidth="450px"
        >
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: 0 }}>
              {confirmModal.msg}
            </p>
          </div>
        </CafeQRPopup>
      )}

      {/* Edit / Create Modal */}
          {editing && (
            <div className="modal-ov" onClick={() => setEditing(null)}>
              <div className="modal-card" onClick={e => e.stopPropagation()}>
                <div className="modal-hd">
                  <h3><FaChair /> {editing.id ? 'Edit Table' : 'New Table'}</h3>
                  <button className="modal-x" onClick={() => setEditing(null)}><FaTimes /></button>
                </div>
                <div className="modal-body">
                  <div className="tc-grid" style={{ gridTemplateColumns: editing.id ? '1fr' : 'repeat(2, 1fr)' }}>
                    {!editing.id && (
                      <div className={`t-card ${editing.createMultiple ? 'active' : ''}`} onClick={() => setEditing({...editing, createMultiple: !editing.createMultiple})}>
                        <div className={`tc-icon ${editing.createMultiple ? 'active' : ''}`}>
                          <FaLayerGroup />
                        </div>
                        <div className="tc-content">
                          <div className="tc-title">Bulk Create</div>
                          <div className="tc-desc">Generate multiple tables at once</div>
                        </div>
                        <div className={`switch ${editing.createMultiple ? 'on' : ''}`}>
                          <input type="checkbox" checked={editing.createMultiple} readOnly />
                          <span className="slider"></span>
                        </div>
                      </div>
                    )}
                    
                    {!editing.id && (
                      <div className={`t-card ${editing.sendEmail ? 'active' : ''}`} onClick={() => setEditing({...editing, sendEmail: !editing.sendEmail})}>
                        <div className={`tc-icon ${editing.sendEmail ? 'active' : ''}`}>
                          <FaQrcode />
                        </div>
                        <div className="tc-content">
                          <div className="tc-title">Email QR codes</div>
                          <div className="tc-desc">Send access links to owner</div>
                        </div>
                        <div className={`switch ${editing.sendEmail ? 'on' : ''}`}>
                          <input type="checkbox" checked={editing.sendEmail} readOnly />
                          <span className="slider"></span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="fg-row">
                    {isAllBranches && !editing.id && (
                      <div className="fg">
                        <label>Branch *</label>
                        <NiceSelect
                          options={[
                            { value: '', label: 'Select Branch' },
                            ...branches.map(branch => ({ value: branch.id, label: branch.name || branch.branchName || 'Branch' }))
                          ]}
                          value={editing.orgId || ''}
                          onChange={v => setEditing({ ...editing, orgId: v })}
                        />
                      </div>
                    )}
                    <div className="fg" style={{ flex: editing.createMultiple ? 1 : 2 }}>
                      <label>{editing.createMultiple ? 'Identifier Prefix *' : 'Table Identifier *'}</label>
                      <input value={editing.tableNumber} onChange={e => setEditing({ ...editing, tableNumber: e.target.value })} placeholder={editing.createMultiple ? 'e.g., T, A, B' : 'e.g., T1, A5, Window-1'} />
                    </div>
                    {editing.createMultiple && (
                      <div className="fg">
                        <label>Table Count</label>
                        <input type="number" min="2" max="50" value={editing.tableCount || 2} onChange={e => setEditing({...editing, tableCount: parseInt(e.target.value) || 2})} placeholder="Number of tables" />
                      </div>
                    )}
                  </div>
                  <div className="fg-row">
                    <div className="fg">
                      <label>Seating Capacity</label>
                      <input type="number" min="1" value={editing.seatingCapacity} onChange={e => setEditing({ ...editing, seatingCapacity: parseInt(e.target.value) || 1 })} />
                    </div>
                    <div className="fg">
                      <div className="fg-lbl-row">
                        <label>Shape</label>
                        {inlineAdd !== 'shape' && <span className="add-link" onClick={() => { setInlineAdd('shape'); setInlineText(''); }}>+ New</span>}
                      </div>
                      {inlineAdd === 'shape' ? (
                        <div className="inline-add-row">
                          <input autoFocus value={inlineText} onChange={e => setInlineText(e.target.value)} placeholder="New shape name" onKeyDown={e => e.key === 'Enter' && handleInlineAdd('shape')} />
                          <button className="ia-ok" onClick={() => handleInlineAdd('shape')}>Add</button>
                          <button className="ia-x" onClick={() => { setInlineAdd(null); setInlineText(''); }}><FaTimes /></button>
                        </div>
                      ) : (
                        <NiceSelect options={shapesList.map(s => ({ value: s, label: s }))} value={editing.shape || ''} onChange={v => setEditing({ ...editing, shape: v })} />
                      )}
                    </div>
                  </div>
                  <div className="fg-row">
                    <div className="fg">
                      <div className="fg-lbl-row">
                        <label>Floor / Level</label>
                        {inlineAdd !== 'floor' && <span className="add-link" onClick={() => { setInlineAdd('floor'); setInlineText(''); }}>+ New</span>}
                      </div>
                      {inlineAdd === 'floor' ? (
                        <div className="inline-add-row">
                          <input autoFocus value={inlineText} onChange={e => setInlineText(e.target.value)} placeholder="New floor name" onKeyDown={e => e.key === 'Enter' && handleInlineAdd('floor')} />
                          <button className="ia-ok" onClick={() => handleInlineAdd('floor')}>Add</button>
                          <button className="ia-x" onClick={() => { setInlineAdd(null); setInlineText(''); }}><FaTimes /></button>
                        </div>
                      ) : (
                        <NiceSelect options={floorsList.map(f => ({ value: f, label: f }))} value={editing.floor || ''} onChange={v => setEditing({ ...editing, floor: v })} />
                      )}
                    </div>
                    <div className="fg">
                      <div className="fg-lbl-row">
                        <label>Section / Zone</label>
                        {inlineAdd !== 'section' && <span className="add-link" onClick={() => { setInlineAdd('section'); setInlineText(''); }}>+ New</span>}
                      </div>
                      {inlineAdd === 'section' ? (
                        <div className="inline-add-row">
                          <input autoFocus value={inlineText} onChange={e => setInlineText(e.target.value)} placeholder="New section name" onKeyDown={e => e.key === 'Enter' && handleInlineAdd('section')} />
                          <button className="ia-ok" onClick={() => handleInlineAdd('section')}>Add</button>
                          <button className="ia-x" onClick={() => { setInlineAdd(null); setInlineText(''); }}><FaTimes /></button>
                        </div>
                      ) : (
                        <NiceSelect options={sectionsList.map(s => ({ value: s, label: s }))} value={editing.section || ''} onChange={v => setEditing({ ...editing, section: v })} />
                      )}
                    </div>
                  </div>
                  <div className="fg-row">
                    <div className="fg">
                      <label>Status</label>
                      <NiceSelect 
                        options={Object.entries(STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
                        value={editing.status || 'AVAILABLE'} 
                        onChange={v => setEditing({ ...editing, status: v })} 
                      />
                    </div>
                    <div className="fg">
                      <label>Display Order</label>
                      <input type="number" min="0" value={editing.displayOrder || 0} onChange={e => setEditing({ ...editing, displayOrder: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="fg">
                    <label>Notes</label>
                    <textarea rows="2" value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} placeholder="Any special notes..." />
                  </div>
                </div>
                <div className="modal-ft">
                  <button className="modal-cancel" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="modal-save" disabled={saving} onClick={handleSave}>
                    {saving ? 'Saving...' : <><FaSave /> {editing.id ? 'Update' : 'Create'}</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className={`_t ${toast.type}`} onClick={() => setToast(null)}>
          {toast.type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Manage Floors / Sections / Shapes Panel */}
      {managePanel && (
        <div className="modal-ov" onClick={() => { setManagePanel(null); setNewItemText(''); }}>
          <div className="modal-card mp-card" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3>{managePanel === 'floors' ? <><FaLayerGroup /> Manage Floors</> : managePanel === 'sections' ? <><FaChair /> Manage Sections</> : <><FaStickyNote /> Manage Shapes</>}</h3>
              <button className="modal-x" onClick={() => { setManagePanel(null); setNewItemText(''); }}><FaTimes /></button>
            </div>
            <div className="mp-body">
              <div className="mp-add-row">
                <input value={newItemText} onChange={e => setNewItemText(e.target.value)} placeholder={`Add new ${currentTitle.toLowerCase().slice(0, -1)}...`} onKeyDown={e => e.key === 'Enter' && addToList(managePanel)} />
                <button className="mp-add-btn" onClick={() => addToList(managePanel)}><FaPlus /> Add</button>
              </div>
              <div className="mp-list">
                {currentList.length === 0 ? (
                  <div className="mp-empty">No {currentTitle.toLowerCase()} added yet</div>
                ) : currentList.map((item, i) => (
                  <div key={i} className="mp-item">
                    <span>{item}</span>
                    <button className="mp-del" onClick={() => removeFromList(managePanel, item)} title="Remove"><FaTimes /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .tm{font-family:'Plus Jakarta Sans',sans-serif;animation:tm-fi .4s ease;padding:16px;width:100%;box-sizing:border-box}
        
        /* Layout Overrides for Professional Look */
        :global(.content-area) { transition: padding 0.3s; padding: 0 !important; }
        :global(.dashboard-header) { transition: padding 0.3s; padding: 0 16px !important; background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); }
        
        @media (max-width:600px){ 
          .tm{padding:12px} 
          :global(.content-area) { padding: 0 !important; }
        }
        @keyframes tm-fi{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

        /* loading */
        .tl { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; gap: 16px; font-family: 'Plus Jakarta Sans', sans-serif; color: #94a3b8; font-weight: 700; font-size: 14px; }
        .tsp { width: 38px; height: 38px; border: 3.5px solid #f1f5f9; border-top-color: #f97316; border-radius: 50%; animation: tm-tsp .7s linear infinite; }
        @keyframes tm-tsp { to { transform: rotate(360deg); } }

        .tm-add:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(249,115,22,.3)}
        .tm-add.sm{font-size:13px;padding:12px 20px;margin-top:20px;border-radius:14px}

        /* Toolbar & Search */
        .tm-toolbar{display:flex;flex-direction:column;gap:16px;margin-bottom:32px;padding:0;width:100%}
        
        .tm-top-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
        .tm-master-actions{display:flex;gap:8px}
        @media (max-width:600px){ 
          .tm-top-row{flex-direction:column;align-items:stretch}
          .tm-master-actions{display:grid;grid-template-columns:repeat(3,1fr)}
        }

        .tm-filter-row{display:flex;gap:12px;align-items:center;width:100%;flex-wrap:wrap}
        @media (max-width:1100px){ .tm-filter-row{flex-direction:column;align-items:stretch} }
        
        .tm-search{display:flex;align-items:center;gap:12px;background:white;border:1px solid #e2e8f0;border-radius:12px;
          padding:0 16px;height:42px;flex:0 0 400px;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);box-shadow:0 2px 4px rgba(0,0,0,0.02)}
        @media (max-width:800px){ .tm-search{flex:1;min-width:unset} }

        .tm-dropdowns { display:flex; gap:8px; }
        @media (max-width:600px){ .tm-dropdowns{display:grid;grid-template-columns:1fr 1fr} }
        .tm-search:focus-within{border-color:#f97316;box-shadow:0 10px 15px -3px rgba(249,115,22,0.1);transform:translateY(-1px)}
        .tm-si{color:#f97316;font-size:14px;flex-shrink:0}
        .tm-search input{flex:1;border:none;outline:none;font:500 13px/1 inherit;color:#1e293b;background:transparent}
        
        .tm-filters-modern { flex:1; overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none; padding:4px 0 }
        
        .tm-btn-master{display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 12px;border-radius:10px;border:1px solid #e2e8f0;
          background:white;color:#64748b;font:700 11px/1 inherit;cursor:pointer;transition:all 0.2s}
        .tm-btn-master:hover{border-color:#f97316;color:#f97316;background:#fff7ed}
        .tm-btn-master svg{color:#f97316;font-size:12px}
        
        .tm-add{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:12px;border:none;
          background:linear-gradient(135deg,#f97316,#ea580c);color:white;font:800 11px/1 inherit;cursor:pointer;
          box-shadow:0 4px 12px rgba(249,115,22,.15);transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);white-space:nowrap}
        .tm-add:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(249,115,22,.25)}
        @media (max-width:600px){ .tm-add{grid-column:span 3} }
        .tm-filters-modern::-webkit-scrollbar { display:none }
        .status-carousel { display:flex; gap:6px; padding-bottom:4px }
        .status-chip { 
          display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:100px; 
          border:1px solid #f1f5f9; background:white; color:#64748b; font-size:11px; font-weight:800;
          cursor:pointer; transition:all 0.2s; white-space:nowrap;
        }
        .status-chip:hover { border-color:#cbd5e1; background:#f8fafc }
        .status-chip.active { background:#0f172a; color:white; border-color:#0f172a; box-shadow:0 4px 12px rgba(15,23,42,0.1) }
        .status-dot { width:6px; height:6px; border-radius:50%; }

        /* Grouped Display Styles */
        .tm-grouped-content { display:flex; flex-direction:column; gap:32px }
        .floor-group { display:flex; flex-direction:column; gap:16px; background:rgba(255,255,255,0.4); border-radius:20px; padding:2px }
        .floor-header { 
          display:flex; align-items:center; gap:8px; font-size:13px; font-weight:900; color:#0f172a;
          padding:10px 14px; background:linear-gradient(to right, #fff, #f8fafc); border-radius:12px; border:1px solid #e2e8f0;
          box-shadow:0 2px 6px rgba(0,0,0,0.02); margin-bottom:2px; text-transform:uppercase; letter-spacing:0.03em;
        }
        .floor-header svg { color:#f97316; font-size:12px }
        .section-group { display:flex; flex-direction:column; gap:10px; padding-left:14px; border-left:1px dashed #cbd5e1; margin-left:8px; margin-bottom:6px }
        .section-header { display:flex; align-items:center; gap:8px; margin-bottom:0px }
        .sh-line { height:1px; width:12px; background:#f97316; border-radius:10px; opacity:0.5 }
        .sh-title { font-size:9px; font-weight:900; color:#94a3b8; text-transform:uppercase; letter-spacing:0.15em }
        .sh-count { font-size:8px; font-weight:800; color:#94a3b8; background:white; border:1px solid #f1f5f9; padding:0px 5px; border-radius:3px }

        /* empty */
        .tm-empty{text-align:center;padding:80px 20px}
        .tme-ic{font-size:48px;color:#e2e8f0;margin-bottom:12px}
        .tm-empty p{font-size:16px;font-weight:800;color:#1e293b;margin:0}

        /* grid */
        .tm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;width:100%}
        @media (max-width:600px){ 
          .tm-grid{grid-template-columns:1fr;gap:12px}
        }
        .tbl-card{background:white;border-radius:20px;position:relative;transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display:flex;flex-direction:column;overflow:hidden;border:1px solid #f1f5f9;box-shadow:0 4px 12px rgba(0,0,0,0.03)}
        .tbl-card:hover{transform:translateY(-4px);box-shadow:0 12px 24px rgba(0,0,0,0.06);border-color:#e2e8f0}
        
        .tbl-card.available{background:linear-gradient(180deg, #fff 0%, #f8fafc 100%)}
        .tbl-card.occupied{background:linear-gradient(180deg, #fff 0%, #fff5f5 100%)}
        .tbl-card.occupied::before{content:'';position:absolute;top:0;left:0;right:0;height:6px;background:#ef4444;z-index:2}
        .tbl-card.reserved{background:linear-gradient(180deg, #fff 0%, #eff6ff 100%)}
        .tbl-card.reserved::before{content:'';position:absolute;top:0;left:0;right:0;height:6px;background:#3b82f6;z-index:2}
        .tbl-card.maintenance{background:linear-gradient(180deg, #fff 0%, #f1f5f9 100%)}
        .tbl-card.maintenance::before{content:'';position:absolute;top:0;left:0;right:0;height:6px;background:#64748b;z-index:2}

        .tbl-top{padding:16px 16px 8px;display:flex;justify-content:space-between;align-items:flex-start}
        .tbl-num-box{display:flex;flex-direction:column;gap:1px}
        .tbl-num{font-size:22px;font-weight:900;color:#0f172a;letter-spacing:-0.03em;line-height:1.1}
        .tbl-name-pill{font-size:11px;font-weight:700;color:#64748b;opacity:0.8}
        
        .tbl-top-actions{display:flex;gap:4px;align-items:center}
        .top-act-btn{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:1px solid #f1f5f9;background:#f8fafc;color:#64748b;font-size:12px;cursor:pointer;transition:all 0.2s}
        .top-act-btn:hover{transform:translateY(-2px);background:white;box-shadow:0 4px 12px rgba(0,0,0,0.05)}
        .top-act-btn.qr:hover{color:#f97316;border-color:#fff7ed}
        .top-act-btn.edit:hover{color:#2563eb;border-color:#dbeafe}
        .top-act-btn.del:hover{color:#ef4444;border-color:#fee2e2}
        
        .tbl-badge{padding:6px 12px;border-radius:100px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;display:flex;align-items:center;gap:6px;width:fit-content;box-shadow:0 2px 4px rgba(0,0,0,0.05)}
        .tbl-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
        
        .tbl-badge.available{background:white;color:#64748b;border:1.5px solid #cbd5e1}
        .tbl-badge.occupied{background:#fee2e2;color:#dc2626;border:1.5px solid #fecaca}
        .tbl-badge.reserved{background:#dbeafe;color:#2563eb;border:1.5px solid #bfdbfe}
        .tbl-badge.maintenance{background:#f1f5f9;color:#475569;border:1.5px solid #e2e8f0}

        .tbl-meta-row{padding:0 16px 10px;display:flex;gap:12px;font-size:10px;font-weight:800;color:#94a3b8}
        .tm-meta-item{display:flex;align-items:center;gap:4px}
        .tbl-mi{color:#f97316;font-size:11px;opacity:0.8}
        
        .tbl-status-grid{padding:0 16px 16px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px}
        .tbl-status-grid.duo{gap:6px}
        .tbl-status-grid.duo .ts-btn{padding:8px 10px;font-size:10px;justify-content:center}
        
        .ts-btn{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1.2px solid #f1f5f9;
          background:white;font:800 10px/1 inherit;color:#64748b;cursor:pointer;transition:all 0.2s;white-space:nowrap}
        
        .tbl-badge.clickable{cursor:pointer;transition:.2s}
        .tbl-badge.clickable:hover{transform:scale(1.05);box-shadow:0 4px 12px rgba(0,0,0,0.1)}
        .ts-btn:hover{background:#f8fafc;transform:scale(1.02)}
        
        .ts-btn.available.active{background:white;color:#0f172a;border-color:#cbd5e1;box-shadow:0 4px 12px rgba(15,23,42,0.08)}
        .ts-btn.occupied.active{background:#ef4444;color:white;border-color:#ef4444;box-shadow:0 4px 12px rgba(239,68,68,0.2)}
        .ts-btn.reserved.active{background:#2563eb;color:white;border-color:#2563eb;box-shadow:0 4px 12px rgba(37,99,235,0.2)}
        .ts-btn.maintenance.active{background:#64748b;color:white;border-color:#64748b;box-shadow:0 4px 12px rgba(100,116,139,0.2)}
        .ts-btn.active .ts-btn-i{opacity:1}
        
        .tbl-actions{padding:20px 24px;background:#f8fafc;border-top:1px solid rgba(0,0,0,0.05);display:flex;flex-wrap:wrap;gap:12px}
        .tbl-act{flex:1;height:42px;border-radius:16px;border:none;background:white;color:#64748b;
          cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:0 2px 4px rgba(0,0,0,0.04);text-transform:uppercase;letter-spacing:0.08em}
        .tbl-act:hover{color:white;background:#f97316;transform:translateY(-2px);box-shadow:0 8px 16px rgba(249,115,22,0.2)}
        .tbl-act.del:hover{color:white;background:#ef4444;box-shadow:0 8px 16px rgba(239,68,68,0.2)}

        /* modal */
        .modal-ov{position:fixed;inset:0;background:rgba(15,23,42,.4);backdrop-filter:blur(8px);z-index:2000;
          display:flex;align-items:center;justify-content:center;padding:20px}
        .modal-card{background:white;border-radius:20px;max-width:500px;width:100%;overflow:hidden;
          box-shadow:0 12px 40px rgba(0,0,0,.08);animation:tm-mi .4s cubic-bezier(.2,1,.2,1); border: 1px solid #e2e8f0; border-top: 3px solid #f97316;}
        @keyframes tm-mi{from{opacity:0;transform:scale(.95) translateY(20px)}to{opacity:1;transform:none}}
        .modal-hd{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid #f1f5f9}
        .modal-hd h3{margin:0;font-size:16px;font-weight:900;color:#0f172a;display:flex;align-items:center;gap:10px}
        .modal-hd h3 svg{color:#f97316}
        .modal-x{width:32px;height:32px;border-radius:8px;border:none;background:#f8fafc;color:#64748b;
          cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:.2s}
        .modal-x:hover{background:#f1f5f9;color:#0f172a;transform:rotate(90deg)}
        .modal-body{padding:20px 24px;max-height:calc(100vh - 200px);overflow-y:auto;display:flex;flex-direction:column;gap:16px}
        .fg-row{display:flex;gap:12px}
        .fg{flex:1;display:flex;flex-direction:column;gap:6px;text-align:left}
        .fg label{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.05em;text-align:left;display:block}
        .fg input,.fg textarea{padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font:600 13px/1.4 inherit;
          color:#0f172a;outline:none;transition:all 0.2s;background:white;width:100%;box-sizing:border-box}
        .fg input:focus,.fg textarea:focus{border-color:#f97316;box-shadow:0 6px 10px rgba(249,115,22,0.06)}
        .fg textarea{resize:vertical;min-height:70px}
        .modal-ft{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px;background:#f8fafc;border-top:1px solid #f1f5f9}
        .modal-cancel{padding:9px 18px;border-radius:10px;border:1.5px solid #e2e8f0;background:white;
          font:700 13px/1 inherit;color:#475569;cursor:pointer;transition:.2s}
        .modal-cancel:hover{border-color:#cbd5e1;background:#f8fafc}
        .modal-save{padding:9px 24px;border-radius:10px;border:none;
          background:linear-gradient(135deg,#f97316,#ea580c);color:white;
          font:700 13px/1 inherit;cursor:pointer;display:flex;align-items:center;gap:8px;
          box-shadow:0 3px 8px rgba(249,115,22,.15);transition:all 0.3s}
        .modal-save:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(249,115,22,.2)}
        .modal-save:disabled{opacity:.5;cursor:not-allowed;transform:none}
        
        .tc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px}
        @media (max-width:500px){ .tc-grid{grid-template-columns:1fr} }
        .t-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1.5px solid #e2e8f0;background:white;cursor:pointer;transition:.2s;user-select:none}
        .t-card.active{border-color:#f97316;background:#fff7ed}
        .tc-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:#f1f5f9;color:#64748b;font-size:14px;transition:.2s}
        .tc-icon.active{background:#ffedd5;color:#f97316}
        .tc-content{flex:1;min-width:0}
        .tc-title{font-size:12px;font-weight:800;color:#0f172a;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tc-desc{font-size:10px;font-weight:600;color:#64748b;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

        .switch{position:relative;width:32px;height:18px;background:#cbd5e1;border-radius:18px;transition:.3s;flex-shrink:0}
        .switch.on{background:#f97316}
        .switch input{opacity:0;width:0;height:0;position:absolute}
        .slider{position:absolute;top:2px;left:2px;width:14px;height:14px;background:white;border-radius:50%;transition:.3s;box-shadow:0 2px 4px rgba(0,0,0,.1)}
        .switch.on .slider{transform:translateX(14px)}



        .res-details-box{margin:0 16px 16px;padding:10px 0;background:transparent;border-top:1px dashed #e2e8f0;display:flex;flex-direction:column;gap:6px}
        .res-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px}
        .rh-title{font-size:10px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:0.08em}
        .rh-meta{display:flex;align-items:center;gap:12px}
        .rh-time, .rh-guests{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:800;color:#2563eb}
        .rh-guests{color:#64748b}
        .res-info{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .res-note{font-size:12px;font-weight:700;color:#1e293b;flex-basis:100%;line-height:1.4;opacity:0.9}
        .res-info-raw{font-size:13px;font-weight:600;color:#1e40af}

        /* manage panel */
        .mp-card{max-width:480px}
        .mp-tabs{display:flex;gap:0;border-bottom:1px solid #f1f5f9;padding:0 24px}
        .mp-tab{flex:1;padding:12px 0;border:none;background:none;font:700 13px/1 inherit;color:#94a3b8;cursor:pointer;
          border-bottom:2.5px solid transparent;transition:.2s;text-align:center}
        .mp-tab.active{color:#f97316;border-bottom-color:#f97316}
        .mp-tab:hover{color:#0f172a}
        .mp-body{padding:20px 24px}
        .mp-add-row{display:flex;gap:8px;margin-bottom:16px}
        .mp-add-row input{flex:1;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font:600 13px/1.4 inherit;
          color:#0f172a;outline:none;background:white;box-sizing:border-box}
        .mp-add-row input:focus{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.08)}
        .mp-add-btn{display:flex;align-items:center;gap:6px;padding:10px 16px;border-radius:10px;border:none;
          background:linear-gradient(135deg,#f97316,#ea580c);color:white;font:700 12px/1 inherit;cursor:pointer;white-space:nowrap}
        .mp-list{display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto}
        .mp-item{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;
          border-radius:10px;border:1px solid #f1f5f9}
        .mp-item span{font:700 13px/1 inherit;color:#1e293b}
        .mp-del{width:26px;height:26px;border-radius:6px;border:none;background:none;color:#cbd5e1;cursor:pointer;
          display:flex;align-items:center;justify-content:center;font-size:11px;transition:.15s}
        .mp-del:hover{background:#fef2f2;color:#ef4444}
        .mp-empty{text-align:center;padding:32px 0;color:#94a3b8;font:600 13px/1 inherit}

        /* inline add in modal */
        .fg-lbl-row{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin-bottom:0}
        .add-link{font-size:11px;font-weight:800;color:#f97316;cursor:pointer;transition:.2s;text-transform:uppercase;letter-spacing:.04em}
        .add-link:hover{color:#ea580c;text-decoration:underline}
        .inline-add-row{display:flex;gap:6px;width:100%;align-items:center}
        .inline-add-row input{flex:1;padding:10px 12px;border:1.5px solid #f97316;border-radius:10px;font:600 13px/1.4 inherit;
          color:#0f172a;outline:none;background:white;box-sizing:border-box;box-shadow:0 0 0 3px rgba(249,115,22,.08)}
        .ia-ok{padding:0 14px;height:40px;border-radius:10px;border:none;background:#f97316;color:white;font:700 12px/1 inherit;cursor:pointer;white-space:nowrap}
        .ia-x{width:40px;height:40px;border-radius:10px;border:1px solid #e2e8f0;background:white;color:#64748b;cursor:pointer;
          display:flex;align-items:center;justify-content:center;font-size:12px}

        /* responsive */
        @media(max-width:768px){
          .tm-stats{gap:8px} .st-card{min-width:80px;padding:12px} .st-n{font-size:20px}
          .tm-toolbar{flex-direction:column;align-items:stretch;gap:16px}
          .tm-grid{grid-template-columns:1fr;gap:12px}
          .fg-row{flex-direction:column;gap:10px}
          .modal-card{max-width:100%;border-radius:24px 24px 0 0;margin-top:auto;max-height:90vh;display:flex;flex-direction:column}
          .modal-ov{padding:0;align-items:flex-end}
          .modal-body{padding:16px}
          .modal-hd{padding:16px}
          .modal-ft{padding:16px}
          .tm-filters{flex-direction:column;width:100%}
          .tm-filters > * {width:100%}
        }
        @media(max-width:480px){
          .tm-actions{flex-direction:column;width:100%}
          .tm-actions button{width:100%}
        }

        /* toast */
        ._t { position: fixed; bottom: 24px; right: 24px; z-index: 9999; padding: 14px 22px; border-radius: 14px; background: #1e293b; color: #fff; display: flex; align-items: center; gap: 12px; font: 700 14px/1 'Plus Jakarta Sans', sans-serif; box-shadow: 0 16px 48px rgba(0,0,0,.25); animation: tm-ti .3s ease; max-width: 380px; }
        @keyframes tm-ti { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        ._t.success { border-left: 4px solid #10b981; }
        ._t.error { border-left: 4px solid #ef4444; }
        @media (max-width: 640px) { ._t { left: 16px; right: 16px; bottom: 24px; max-width: none; } }
      `}</style>
    </DashboardLayout>
  );
}
