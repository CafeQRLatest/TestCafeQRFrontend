// components/WindowsSpoolerSetup.js
import React, { useEffect, useState } from 'react';
import { printUniversal } from '../utils/printGateway';

export default function WindowsSpoolerSetup() {
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3333/printRaw');
  const [listUrl, setListUrl] = useState(localStorage.getItem('PRINT_WIN_LIST_URL') || 'http://127.0.0.1:3333/printers');
  const [printers, setPrinters] = useState([]);
  const [pick, setPick] = useState(localStorage.getItem('PRINT_WIN_PRINTER_NAME') || '');
  const [msg, setMsg] = useState('');

  const loadPrinters = async () => {
    try {
      const r = await fetch(listUrl);
      const names = await r.json();
      setPrinters(Array.isArray(names) ? names : []);
      setMsg(`✓ Loaded ${Array.isArray(names) ? names.length : 0} printers`);
    } catch (e) {
      setMsg(`✗ Could not load printers: ${e.message}`);
    }
  };

  const save = () => {
    localStorage.setItem('PRINT_WIN_URL', baseUrl.trim());
    localStorage.setItem('PRINT_WIN_LIST_URL', listUrl.trim());
    localStorage.setItem('PRINT_WIN_PRINTER_NAME', pick.trim());
    setMsg(pick ? `✓ Saved printer: ${pick}` : '✗ Pick a printer first');
  };

  const testPrint = async () => {
    try {
      if (!pick) { setMsg('✗ Pick a printer first'); return; }
      await printUniversal({ text: '*** TEST PRINT ***\n\nSent via Windows spooler.\n', allowSystemDialog: false });
      setMsg('✓ Test sent to Windows spooler');
    } catch (e) {
      setMsg(`✗ Test failed: ${e.message}`);
    }
  };

  return (
    <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' }}>
      <h3 style={{ marginTop:0 }}>Windows Spooler</h3>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
        <input value={listUrl} onChange={e=>setListUrl(e.target.value)} style={{ minWidth:320, padding:8 }} placeholder="http://127.0.0.1:3333/printers" />
        <button onClick={loadPrinters}>Load printers</button>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
        <select value={pick} onChange={e=>setPick(e.target.value)} style={{ minWidth:320, padding:8 }}>
          <option value="">— Select Windows printer —</option>
          {printers.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} style={{ minWidth:320, padding:8 }} placeholder="http://127.0.0.1:3333/printRaw" />
        <button onClick={save}>Save</button>
        <button onClick={testPrint}>Test print</button>
      </div>
      {msg ? <div>{msg}</div> : null}
    </div>
  );
}
