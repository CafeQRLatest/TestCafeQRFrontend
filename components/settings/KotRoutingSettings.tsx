// components/settings/KotRoutingSettings.tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  CategoryRow,
  fetchCategories,
  loadConfig,
  saveConfig,
  addStation,
  updateStation,
  removeStation,
  setBillPrinters,
  setDefaultKotPrinters,
  buildCategoryNameMap,
  DbSyncOpts,
} from '../../utils/kotRoutingSettings';
import {
  PrintRoutingConfig,
  KitchenStation,
  PrinterTarget,
} from '../../utils/printRouting';

type Props = {
  apiBase: string;
  authToken: string;
  clientId: string;
  orgId: string;
  terminalId?: string;
  availableWinPrinters?: string[];
};

function printerLabel(p: PrinterTarget): string {
  if (p.type === 'winspool') return `🖨 ${(p as any).printerName}`;
  if (p.type === 'android-bt') return `📱 BT: ${(p as any).address}`;
  if (p.type === 'webusb') return `🔌 USB: ${(p as any).vendorId}:${(p as any).productId}`;
  return 'Printer';
}

function emptyStation(): Omit<KitchenStation, 'id'> {
  return { name: '', categoryIds: [], printers: [] };
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb', borderRadius: 8,
  padding: 14, marginBottom: 10, background: '#fff',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 14, marginBottom: 8, boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#6b7280',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Btn({ children, onClick, primary, danger, disabled }: {
  children: React.ReactNode; onClick?: () => void;
  primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 16px', borderRadius: 6, border: '1px solid',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 13, fontWeight: 500, opacity: disabled ? 0.6 : 1,
      background: primary ? '#2563eb' : danger ? '#fee2e2' : '#fff',
      borderColor: primary ? '#2563eb' : danger ? '#fca5a5' : '#d1d5db',
      color: primary ? '#fff' : danger ? '#dc2626' : '#111',
    }}>
      {children}
    </button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{children}</div>;
}

function CategoryPicker({ categories, selected, onToggle, usedByCfg, excludeStationId }: {
  categories: CategoryRow[]; selected: string[];
  onToggle: (id: string) => void;
  usedByCfg: PrintRoutingConfig; excludeStationId?: string;
}) {
  const usedIds = new Set(
    usedByCfg.stations
      .filter(s => s.id !== excludeStationId)
      .flatMap(s => s.categoryIds)
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
      {categories.map(cat => {
        const isSelected = selected.includes(cat.id);
        const isUsed = !isSelected && usedIds.has(cat.id);
        return (
          <button key={cat.id} onClick={() => !isUsed && onToggle(cat.id)}
            title={isUsed ? 'Already assigned to another station' : ''}
            style={{
              padding: '4px 10px', borderRadius: 16, border: '1px solid',
              cursor: isUsed ? 'not-allowed' : 'pointer', fontSize: 13,
              fontWeight: isSelected ? 600 : 400,
              background: isSelected ? '#2563eb' : isUsed ? '#f3f4f6' : '#fff',
              borderColor: isSelected ? '#2563eb' : '#d1d5db',
              color: isSelected ? '#fff' : isUsed ? '#9ca3af' : '#111',
              opacity: isUsed ? 0.6 : 1,
            }}>
            {cat.name}
          </button>
        );
      })}
      {categories.length === 0 && (
        <span style={{ color: '#9ca3af', fontSize: 13 }}>No categories found</span>
      )}
    </div>
  );
}

function PrinterList({ printers, available, onToggle }: {
  printers: PrinterTarget[]; available: string[];
  onToggle: (name: string) => void;
}) {
  const selectedNames = printers
    .filter(p => p.type === 'winspool')
    .map(p => (p as any).printerName as string);

  if (available.length === 0) {
    return (
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>
        No Windows printers found. Start print-hub.ps1 and reload.
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
      {available.map(name => {
        const isSelected = selectedNames.includes(name);
        return (
          <button key={name} onClick={() => onToggle(name)} style={{
            padding: '4px 12px', borderRadius: 16, border: '1px solid',
            cursor: 'pointer', fontSize: 13,
            background: isSelected ? '#0f172a' : '#fff',
            borderColor: isSelected ? '#0f172a' : '#d1d5db',
            color: isSelected ? '#fff' : '#111',
            fontWeight: isSelected ? 600 : 400,
          }}>
            🖨 {name}
          </button>
        );
      })}
    </div>
  );
}

export default function KotRoutingSettings({
  apiBase, authToken, clientId, orgId, terminalId,
  availableWinPrinters = [],
}: Props) {
  const [cfg, setCfg] = useState<PrintRoutingConfig>({ billPrinters: [], kotDefaultPrinters: [], stations: [] });
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [newStation, setNewStation] = useState<Omit<KitchenStation, 'id'>>(emptyStation());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<KitchenStation>>({});

  const dbOpts: DbSyncOpts = { apiBase, authToken, clientId, orgId, terminalId };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cfgLoaded, cats] = await Promise.all([
          loadConfig(dbOpts),
          fetchCategories(apiBase, authToken, orgId),
        ]);
        if (!cancelled) { setCfg(cfgLoaded); setCategories(cats); }
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, terminalId]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try { await saveConfig(cfg, dbOpts); showToast('Routing config saved ✓'); }
    catch { showToast('Save failed — check connection', false); }
    finally { setSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  function togglePrinterInList(printers: PrinterTarget[], name: string): PrinterTarget[] {
    const exists = printers.find(p => p.type === 'winspool' && (p as any).printerName === name);
    if (exists) return printers.filter(p => !(p.type === 'winspool' && (p as any).printerName === name));
    return [...printers, { type: 'winspool', printerName: name }];
  }

  // new station handlers
  const toggleNewCat = (id: string) => setNewStation(p => ({
    ...p, categoryIds: p.categoryIds.includes(id) ? p.categoryIds.filter(x => x !== id) : [...p.categoryIds, id],
  }));
  const toggleNewPrinter = (name: string) => setNewStation(p => ({
    ...p, printers: togglePrinterInList(p.printers, name),
  }));
  const handleAddStation = () => {
    if (!newStation.name.trim()) return;
    setCfg(prev => addStation(prev, newStation));
    setNewStation(emptyStation());
  };

  // edit handlers
  const startEdit = (s: KitchenStation) => { setEditingId(s.id); setEditDraft({ ...s }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };
  const commitEdit = () => {
    if (!editingId) return;
    setCfg(prev => updateStation(prev, editingId, editDraft));
    cancelEdit();
  };
  const toggleEditCat = (id: string) => setEditDraft(p => ({
    ...p, categoryIds: (p.categoryIds ?? []).includes(id)
      ? (p.categoryIds ?? []).filter(x => x !== id) : [...(p.categoryIds ?? []), id],
  }));
  const toggleEditPrinter = (name: string) => setEditDraft(p => ({
    ...p, printers: togglePrinterInList(p.printers ?? [], name),
  }));

  const categoryNameMap = buildCategoryNameMap(categories);

  if (loading) return <div style={{ padding: 24, color: '#666' }}>Loading KOT routing settings…</div>;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>KOT Routing Settings</h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
        Route menu categories to specific kitchen printers. Unmatched items go to the Default KOT printer.
      </p>

      <Section title="Bill / Final Receipt Printer">
        <PrinterList
          printers={cfg.billPrinters}
          available={availableWinPrinters}
          onToggle={name => setCfg(prev => setBillPrinters(prev, togglePrinterInList(prev.billPrinters, name)))}
        />
      </Section>

      <Section title="Default KOT Printer (unmatched categories)">
        <PrinterList
          printers={cfg.kotDefaultPrinters}
          available={availableWinPrinters}
          onToggle={name => setCfg(prev => setDefaultKotPrinters(prev, togglePrinterInList(prev.kotDefaultPrinters, name)))}
        />
      </Section>

      <Section title="Kitchen Stations">
        {cfg.stations.length === 0 && (
          <p style={{ color: '#999', fontSize: 13 }}>No stations yet. Add one below.</p>
        )}
        {cfg.stations.map(station => (
          <div key={station.id} style={cardStyle}>
            {editingId === station.id ? (
              <>
                <input style={inputStyle} value={editDraft.name ?? ''} placeholder="Station name"
                  onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))} />
                <p style={labelStyle}>Categories:</p>
                <CategoryPicker categories={categories} selected={editDraft.categoryIds ?? []}
                  onToggle={toggleEditCat} usedByCfg={cfg} excludeStationId={editingId} />
                <p style={labelStyle}>Printers:</p>
                <PrinterList printers={editDraft.printers ?? []} available={availableWinPrinters} onToggle={toggleEditPrinter} />
                <Row><Btn onClick={commitEdit} primary>Save</Btn><Btn onClick={cancelEdit}>Cancel</Btn></Row>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{station.name}</div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
                  Categories: {station.categoryIds.map(id => categoryNameMap[id] || id).join(', ') || '—'}
                </div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                  Printers: {station.printers.map(printerLabel).join(', ') || '—'}
                </div>
                <Row>
                  <Btn onClick={() => startEdit(station)}>Edit</Btn>
                  <Btn onClick={() => setCfg(prev => removeStation(prev, station.id))} danger>Remove</Btn>
                </Row>
              </>
            )}
          </div>
        ))}

        <div style={{ ...cardStyle, background: '#f8f9fa', marginTop: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Add Station</p>
          <input style={inputStyle} value={newStation.name} placeholder="e.g. Main Kitchen, Juice Bar"
            onChange={e => setNewStation(p => ({ ...p, name: e.target.value }))} />
          <p style={labelStyle}>Assign categories:</p>
          <CategoryPicker categories={categories} selected={newStation.categoryIds}
            onToggle={toggleNewCat} usedByCfg={cfg} />
          <p style={labelStyle}>Printers:</p>
          <PrinterList printers={newStation.printers} available={availableWinPrinters} onToggle={toggleNewPrinter} />
          <Btn onClick={handleAddStation} primary disabled={!newStation.name.trim()}>+ Add Station</Btn>
        </div>
      </Section>

      <div style={{ marginTop: 24 }}>
        <Btn onClick={handleSave} primary disabled={saving}>
          {saving ? 'Saving…' : 'Save Routing Config'}
        </Btn>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: toast.ok ? '#22c55e' : '#ef4444',
          color: '#fff', borderRadius: 8, padding: '10px 18px',
          fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,.2)', zIndex: 9999,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
