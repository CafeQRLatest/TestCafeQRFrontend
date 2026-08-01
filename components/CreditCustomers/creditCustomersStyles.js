// Plain CSS string — works with <style jsx global>{creditCustomersStyles}</style>
const creditCustomersStyles = `
  .credit-page {
    padding: 0 20px 40px;
    color: #334155;
    font-family: 'Inter', sans-serif;
  }
  .credit-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .credit-mode-slider {
    display: inline-flex;
    align-items: center;
    background: #f1f5f9;
    padding: 4px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    gap: 4px;
  }
  .slider-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    font-size: 13.5px;
    font-weight: 700;
    color: #64748b;
    border-radius: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .slider-btn:hover {
    color: #0f172a;
  }
  .slider-btn.active {
    background: #ffffff;
    color: #f97316;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  h1, h2, h3, .modal-title {
    font-family: 'Outfit', sans-serif;
  }
  h1 {
    margin: 0;
    color: #0f172a;
    font-size: 26px;
    font-weight: 900;
  }
  .primary, .refresh-btn, .search-input, .form-input, .rpt-modal-btn, .allocation-row input {
    font-family: 'Inter', sans-serif;
  }
  .subtitle {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }
  .primary {
    border: 0;
    background: #f97316;
    color: #fff;
    border-radius: 12px;
    padding: 12px 18px;
    font-weight: 900;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(249,115,22,.25);
  }
  .primary:hover {
    transform: translateY(-1.5px);
    box-shadow: 0 6px 16px rgba(249,115,22,.35);
    background: #ea580c;
  }
  .primary:active {
    transform: translateY(0);
  }

  /* Reports-matching KPI Grid */
  .rpt-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .rpt-kpi {
    background: #ffffff;
    border: 1px solid #f1f5f9;
    border-radius: 16px;
    padding: 16px;
    display: grid;
    grid-template-areas: "label icon" "value icon";
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    gap: 6px 12px;
    transition: all 0.3s ease;
    min-height: 90px;
    box-sizing: border-box;
  }
  .rpt-kpi:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0,0,0,.03);
  }
  .rpt-kpi-icon {
    grid-area: icon;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }
  .rpt-kpi-data {
    display: contents;
  }
  .rpt-kpi-label {
    grid-area: label;
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: .5px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .rpt-kpi-val {
    grid-area: value;
    font-size: 20px;
    font-weight: 800;
    color: #1e293b;
    line-height: 1.1;
    word-break: break-word;
    font-family: 'Outfit', sans-serif;
  }
  .rpt-kpi-val.text-danger {
    color: #dc2626;
  }

  /* Toolbar Search & Refresh */
  .toolbar {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    align-items: center;
  }
  .search-wrapper {
    position: relative;
    flex: 1;
    max-width: 320px;
    display: flex;
    align-items: center;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 0 14px;
    height: 42px;
    transition: all 0.2s ease;
  }
  .search-wrapper:focus-within {
    border-color: #f97316;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
    background: #ffffff;
  }
  .search-icon {
    color: #94a3b8;
    font-size: 14px;
    margin-right: 10px;
    flex-shrink: 0;
  }
  .search-input {
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    color: #0f172a;
    width: 100%;
    outline: none;
    height: 100%;
    font-family: 'Inter', sans-serif;
  }
  .search-input::placeholder {
    color: #94a3b8;
  }
  .search-clear {
    border: none;
    background: transparent;
    font-size: 18px;
    color: #94a3b8;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    transition: color 0.15s ease;
  }
  .search-clear:hover {
    color: #ef4444;
  }
  .refresh-btn {
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #475569;
    border-radius: 12px;
    padding: 11px 20px;
    font-size: 13.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  }
  .refresh-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
  }
  .refresh-btn:active {
    transform: scale(0.98);
  }

  /* Reports-matching Table CSS */
  .rpt-tbl-wrap {
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    overflow: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  }
  .rpt-tbl {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px;
  }
  .rpt-tbl th {
    background: #fff;
    padding: 8px 16px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: .05em;
    border-bottom: 2px solid #FF7A00;
    font-family: 'Inter', sans-serif;
  }
  .rpt-tbl td {
    padding: 8px 16px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 13px;
    color: #475569;
    vertical-align: middle;
    white-space: nowrap;
    transition: background-color 0.15s ease;
    font-family: 'Inter', sans-serif;
  }
  .rpt-tbl tbody tr:hover td {
    background: #fffbf5;
  }
  .rpt-tbl tbody tr.active-row td {
    background-color: #f8fafc;
  }
  .r {
    text-align: right !important;
  }
  .rpt-amt {
    font-weight: 800;
    color: #1e293b;
  }
  .text-danger {
    color: #dc2626;
  }
  .text-success {
    color: #166534;
  }
  .text-muted {
    color: #64748b;
  }
  .font-bold {
    font-weight: 700;
  }

  /* Standard Pagination Bar */
  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 16px 0;
    border-top: 1px solid #f1f5f9;
    background: #ffffff;
    border-bottom-left-radius: 16px;
    border-bottom-right-radius: 16px;
  }
  .pg-btn {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 700;
    color: #f97316;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .pg-btn:hover:not(:disabled) {
    background: #fff7ed;
    border-color: #f97316;
    transform: translateY(-1px);
  }
  .pg-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }
  .pg-info {
    font-size: 13px;
    font-weight: 700;
    color: #64748b;
  }

  /* Reports status pills */
  .rpt-st {
    font-size: 9px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
    text-transform: uppercase;
    display: inline-block;
  }
  .rpt-st.active, .rpt-st.completed, .rpt-st.paid {
    background: #ecfdf5;
    color: #10b981;
  }
  .rpt-st.suspended, .rpt-st.cancelled, .rpt-st.void, .rpt-st.voided {
    background: #fef2f2;
    color: #ef4444;
  }
  .rpt-st.draft, .rpt-st.pending, .rpt-st.unpaid, .rpt-st.billed {
    background: #fff7ed;
    color: #f97316;
  }
  .rpt-st.partial {
    background: #fffbeb;
    color: #d97706;
  }

  /* Beautiful Action Buttons Group (With Icons only) */
  .btn-group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .btn-action {
    width: 32px;
    height: 32px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    background: #ffffff;
    color: #475569;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    padding: 0;
  }
  .btn-action:hover {
    transform: translateY(-1px);
  }
  .btn-action:active {
    transform: translateY(0);
  }
  .btn-action-pay {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #166534;
  }
  .btn-action-pay:hover {
    background: #dcfce7;
    border-color: #86efac;
    box-shadow: 0 4px 6px -1px rgba(22, 101, 52, 0.05);
  }
  .btn-action-orders {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1e40af;
  }
  .btn-action-orders:hover {
    background: #dbeafe;
    border-color: #93c5fd;
    box-shadow: 0 4px 6px -1px rgba(30, 64, 175, 0.05);
  }
  .btn-action-status.suspend {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #9f1239;
  }
  .btn-action-status.suspend:hover {
    background: #ffe4e6;
    border-color: #fda4af;
    box-shadow: 0 4px 6px -1px rgba(159, 18, 57, 0.05);
  }
  .btn-action-status.reactivate {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #065f46;
  }
  .btn-action-status.reactivate:hover {
    background: #d1fae5;
    border-color: #6ee7b7;
    box-shadow: 0 4px 6px -1px rgba(6, 95, 70, 0.05);
  }
  .btn-action-edit {
    background: #f8fafc;
    border-color: #e2e8f0;
    color: #334155;
  }
  .btn-action-edit:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #0f172a;
  }

  /* Super minimal expanded ledger item rows */
  .expanded-row-cell {
    background: #f8fafc;
    padding: 12px 20px;
    border-bottom: 1px solid #e2e8f0;
  }
  .expanded-tabs {
    display: flex;
    gap: 16px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 12px;
    padding-bottom: 2px;
  }
  .expanded-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #64748b;
    font-family: 'Inter', sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    padding: 6px 4px 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .expanded-tab:hover {
    color: #0f172a;
  }
  .expanded-tab.active {
    color: #f97316;
    border-bottom-color: #f97316;
  }

  .ledger-empty {
    color: #94a3b8;
    font-size: 13px;
    padding: 8px 12px;
    text-align: center;
  }

  /* Reports monospace document link styling */
  .rpt-mono-link {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 600;
    color: #f97316;
    background: #fff7ed;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-block;
  }
  .rpt-mono-link:hover {
    background: #ffedd5;
    color: #ea580c;
  }

  /* Reports matching loading states */
  .rpt-loading {
    text-align: center;
    padding: 60px 20px;
    color: #94a3b8;
    font-weight: 700;
    font-size: 14px;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid #e2e8f0;
    border-top-color: #f97316;
    border-radius: 50%;
    margin: 0 auto 12px;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Reports matching empty states */
  .rpt-empty {
    text-align: center;
    padding: 60px 20px;
    color: #cbd5e1;
    font-size: 14px;
    font-weight: 600;
  }

  /* Reports matching Modals & Overlays */
  .rpt-modal-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(15,23,42,0.4);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 12px;
    animation: fadeIn 0.2s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .rpt-modal {
    background: white;
    padding: 24px;
    border-radius: 16px;
    width: 100%;
    box-shadow: 0 12px 24px -10px rgba(0,0,0,0.15);
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    display: grid;
    gap: 16px;
  }
  @keyframes slideUp {
    from { transform: translateY(12px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .modal-title {
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.01em;
    border-bottom: 1.5px solid #f1f5f9;
    padding-bottom: 10px;
  }
  .modal-form {
    display: grid;
    gap: 14px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .form-hint {
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    margin-top: 4px;
  }
  .form-hint.text-success {
    color: #059669;
  }
  .rpt-modal label {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    display: block;
    margin-bottom: 4px;
  }
  .form-input {
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    padding: 11px 14px;
    color: #1e293b;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.15s ease;
    background: #f8fafc;
  }
  .form-input:focus {
    outline: none;
    border-color: #f97316;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
    background: #ffffff;
  }
  textarea.form-input {
    min-height: 80px;
    resize: vertical;
  }
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
    border-top: 1px solid #f1f5f9;
    padding-top: 16px;
  }
  .rpt-modal-btn {
    height: 38px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    padding: 0 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .rpt-modal-btn-outline {
    background: #fff;
    border: 1.5px solid #e2e8f0;
    color: #64748b;
  }
  .rpt-modal-btn-outline:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  /* Payment summary block */
  .payment-summary-banner {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .summary-item .label {
    font-size: 10px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .summary-item .value {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }
  .summary-item .value.balance.debt {
    color: #dc2626;
  }

  /* Manual Allocation styling */
  .manual-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .manual-box strong {
    font-size: 12px;
    color: #475569;
  }
  .allocation-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 150px;
    overflow-y: auto;
  }
  .allocation-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #ffffff;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #f1f5f9;
  }
  .allocation-row span {
    font-size: 12px;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .credit-page {
      padding: 0 4px 32px;
    }
    .credit-head {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }
    .primary {
      width: 100%;
      justify-content: center;
    }
    .rpt-kpi-grid {
      grid-template-columns: 1fr;
    }
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    .search-wrapper {
      max-width: none !important;
    }
    .form-row {
      grid-template-columns: 1fr;
    }
    .ledger-row-minimal {
      grid-template-columns: 1fr;
      gap: 6px;
    }
  }
`;

export default creditCustomersStyles;
