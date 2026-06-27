import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { FaPercent, FaFileCsv, FaArrowLeft, FaSync, FaInfoCircle, FaCalendarAlt, FaBuilding, FaDesktop, FaPrint, FaSearch, FaFilter, FaChartPie } from 'react-icons/fa';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import api from '../../utils/api';
import { getBusinessNow } from '../../utils/timezoneUtils';
import { getCurrencySymbol } from '../../constants/expenseScopes';


/**********************************************************
 * Helpers matching accounting and reports formatters
 **********************************************************/
function localDatePart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultAccountingPeriod(timezone) {
  const bizNow = getBusinessNow(timezone);
  const date = localDatePart(bizNow);
  return {
    from: `${date}T00:00`,
    to: `${date}T23:59`
  };
}

function toInstant(dtLocal) {
  if (!dtLocal) return undefined;
  try {
    return new Date(`${dtLocal}:00`).toISOString();
  } catch {
    return undefined;
  }
}

function money(value) {
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) ? parsed : 0;
  return valid.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function TaxReportsPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Reports & Billing">
      <TaxReportsContent />
    </RoleGate>
  );
}

function TaxReportsContent() {
  const router = useRouter();
  const { timezone, userRole, currency, orgId } = useAuth();
  const { notify } = useNotification();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  // Superadmin org/terminal states
  const [organizations, setOrganizations] = useState([]);
  const [allTerminals, setAllTerminals] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');

  // Main UI states
  const [period, setPeriod] = useState(() => defaultAccountingPeriod(timezone));
  const [activeSubTab, setActiveSubTab] = useState('taxCode');
  const [taxAggregation, setTaxAggregation] = useState('monthly');
  const [taxReportData, setTaxReportData] = useState(null);
  const [taxData, setTaxData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [showFilingAssistant, setShowFilingAssistant] = useState(false);
  const [config, setConfig] = useState(null);

  // Load superadmin filters
  useEffect(() => {
    if (!isSuperAdmin) return;
    Promise.all([
      api.get('/api/v1/organizations'),
      api.get('/api/v1/terminals')
    ]).then(([orgRes, termRes]) => {
      if (orgRes.data?.success) setOrganizations(orgRes.data.data || []);
      if (termRes.data?.success) setAllTerminals(termRes.data.data || []);
    }).catch(() => {});
  }, [isSuperAdmin]);

  const handleOrgChange = (val) => {
    setSelectedOrgId(val);
    setSelectedTerminalId('');
  };

  const filteredTerminals = useMemo(() => {
    if (!selectedOrgId) return allTerminals;
    return allTerminals.filter(t => t.orgId === selectedOrgId || t.organization?.id === selectedOrgId);
  }, [allTerminals, selectedOrgId]);

  useEffect(() => {
    let active = true;
    const params = {};
    if (isSuperAdmin && selectedOrgId) {
      params.orgId = selectedOrgId;
    }
    api.get('/api/v1/configurations', { params })
      .then(res => {
        if (active && res.data?.data) {
          setConfig(res.data.data);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [selectedOrgId, isSuperAdmin, orgId]);

  // API query routine
  const fetchTaxData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        from: toInstant(period.from),
        to: toInstant(period.to)
      };
      if (isSuperAdmin && selectedOrgId) params.orgId = selectedOrgId;
      if (isSuperAdmin && selectedTerminalId) params.terminalId = selectedTerminalId;

      const [taxReportRes, taxSummaryRes] = await Promise.all([
        api.get('/api/v1/reports/tax-report-details', { params }),
        api.get('/api/v1/reports/tax-summary', { params })
      ]);

      if (taxReportRes.data?.success) setTaxReportData(taxReportRes.data.data || null);
      if (taxSummaryRes.data?.success) setTaxData(taxSummaryRes.data.data || []);
    } catch (err) {
      notify('error', 'Failed to retrieve Tax Reports data');
    } finally {
      setLoading(false);
    }
  }, [period, selectedOrgId, selectedTerminalId, isSuperAdmin, notify]);

  useEffect(() => {
    fetchTaxData();
  }, [fetchTaxData]);

  // Memoized calculations and formatting
  const SYM = config?.currencySymbol || getCurrencySymbol(currency);
  const fmt = money;

  const taxCodeRows = useMemo(() => {
    return taxReportData?.taxCodeSummary || taxData.map(t => ({
      taxCode: t.taxCode || '—',
      description: t.description || t.categoryName || 'Goods/Service',
      uqc: t.uqc || 'OTH',
      totalQuantity: Number(t.totalQuantity || t.lineCount || 0),
      taxableValue: Number(t.taxableAmount || 0),
      integratedTax: Number(t.integratedTax || 0),
      centralTax: Number(t.centralTax || t.cgst || 0),
      stateTax: Number(t.stateTax || t.sgst || 0),
      cessAmount: Number(t.cessAmount || 0),
      taxRate: Number(t.taxRate || 0),
    }));
  }, [taxReportData, taxData]);

  const b2bInvoices = taxReportData?.b2bInvoices || [];
  const b2cSummary = taxReportData?.b2cSummary || [];
  const rawMonthly = taxReportData?.monthlyAggregation || [];

  const totalTaxable = useMemo(() => taxCodeRows.reduce((s, r) => s + Number(r.taxableValue || 0), 0), [taxCodeRows]);
  const totalIGST = useMemo(() => taxCodeRows.reduce((s, r) => s + Number(r.integratedTax || 0), 0), [taxCodeRows]);
  const totalCGST = useMemo(() => taxCodeRows.reduce((s, r) => s + Number(r.centralTax || 0), 0), [taxCodeRows]);
  const totalSGST = useMemo(() => taxCodeRows.reduce((s, r) => s + Number(r.stateTax || 0), 0), [taxCodeRows]);
  const totalTax = totalIGST + totalCGST + totalSGST;

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRateFilter, setSelectedRateFilter] = useState('');

  // Clear filters on tab switch
  useEffect(() => {
    setSearchQuery('');
    setSelectedRateFilter('');
  }, [activeSubTab]);

  // Extract unique rates for the active tab dataset
  const uniqueRates = useMemo(() => {
    let dataset = [];
    if (activeSubTab === 'taxCode') dataset = taxCodeRows;
    else if (activeSubTab === 'b2b') dataset = b2bInvoices;
    else if (activeSubTab === 'b2c') {
      dataset = b2cSummary.length > 0 ? b2cSummary : taxCodeRows;
    }
    const rates = dataset.map(r => Number(r.taxRate || 0));
    return [...new Set(rates)].sort((a, b) => a - b);
  }, [activeSubTab, taxCodeRows, b2bInvoices, b2cSummary]);

  // Filtered rows for each tab
  const filteredTaxCodeRows = useMemo(() => {
    return taxCodeRows.filter(r => {
      const matchesSearch = 
        r.taxCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.uqc?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRate = 
        !selectedRateFilter || 
        Math.abs(Number(r.taxRate) - Number(selectedRateFilter)) < 0.01;
      return matchesSearch && matchesRate;
    });
  }, [taxCodeRows, searchQuery, selectedRateFilter]);

  const filteredB2BRows = useMemo(() => {
    return b2bInvoices.filter(r => {
      const matchesSearch = 
        r.taxId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.receiverName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.invoiceNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.placeOfSupply?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.invoiceType?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRate = 
        !selectedRateFilter || 
        Math.abs(Number(r.taxRate) - Number(selectedRateFilter)) < 0.01;
      return matchesSearch && matchesRate;
    });
  }, [b2bInvoices, searchQuery, selectedRateFilter]);

  const filteredB2CRows = useMemo(() => {
    const rawB2C = b2cSummary.length > 0 ? b2cSummary : taxCodeRows.map(r => ({
      type: 'B2C (Others)', placeOfSupply: 'State', taxRate: r.taxRate,
      taxableValue: r.taxableValue, igst: r.integratedTax, cgst: r.centralTax, sgst: r.stateTax
    }));
    return rawB2C.filter(r => {
      const matchesSearch = 
        r.type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.placeOfSupply?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRate = 
        !selectedRateFilter || 
        Math.abs(Number(r.taxRate) - Number(selectedRateFilter)) < 0.01;
      return matchesSearch && matchesRate;
    });
  }, [b2cSummary, taxCodeRows, searchQuery, selectedRateFilter]);

  const filteredAggRows = useMemo(() => {
    return rawMonthly.filter(r => {
      return r.period?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [rawMonthly, searchQuery]);

  // Reactive totals based on filters
  const filteredTotalTaxable = useMemo(() => {
    if (activeSubTab === 'taxCode') return filteredTaxCodeRows.reduce((s, r) => s + Number(r.taxableValue || 0), 0);
    if (activeSubTab === 'b2b') return filteredB2BRows.reduce((s, r) => s + Number(r.taxableValue || 0), 0);
    if (activeSubTab === 'b2c') return filteredB2CRows.reduce((s, r) => s + Number(r.taxableValue || 0), 0);
    return rawMonthly.length > 0 ? filteredAggRows.reduce((s, r) => s + Number(r.taxableValue || 0), 0) : totalTaxable;
  }, [activeSubTab, filteredTaxCodeRows, filteredB2BRows, filteredB2CRows, filteredAggRows, rawMonthly, totalTaxable]);

  const filteredTotalIGST = useMemo(() => {
    if (activeSubTab === 'taxCode') return filteredTaxCodeRows.reduce((s, r) => s + Number(r.integratedTax || 0), 0);
    if (activeSubTab === 'b2b') return filteredB2BRows.reduce((s, r) => s + Number(r.igst || 0), 0);
    if (activeSubTab === 'b2c') return filteredB2CRows.reduce((s, r) => s + Number(r.igst || 0), 0);
    return rawMonthly.length > 0 ? filteredAggRows.reduce((s, r) => s + Number(r.igst || 0), 0) : totalIGST;
  }, [activeSubTab, filteredTaxCodeRows, filteredB2BRows, filteredB2CRows, filteredAggRows, rawMonthly, totalIGST]);

  const filteredTotalCGST = useMemo(() => {
    if (activeSubTab === 'taxCode') return filteredTaxCodeRows.reduce((s, r) => s + Number(r.centralTax || 0), 0);
    if (activeSubTab === 'b2b') return filteredB2BRows.reduce((s, r) => s + Number(r.cgst || 0), 0);
    if (activeSubTab === 'b2c') return filteredB2CRows.reduce((s, r) => s + Number(r.cgst || 0), 0);
    return rawMonthly.length > 0 ? filteredAggRows.reduce((s, r) => s + Number(r.cgst || 0), 0) : totalCGST;
  }, [activeSubTab, filteredTaxCodeRows, filteredB2BRows, filteredB2CRows, filteredAggRows, rawMonthly, totalCGST]);

  const filteredTotalSGST = useMemo(() => {
    if (activeSubTab === 'taxCode') return filteredTaxCodeRows.reduce((s, r) => s + Number(r.stateTax || 0), 0);
    if (activeSubTab === 'b2b') return filteredB2BRows.reduce((s, r) => s + Number(r.sgst || 0), 0);
    if (activeSubTab === 'b2c') return filteredB2CRows.reduce((s, r) => s + Number(r.sgst || 0), 0);
    return rawMonthly.length > 0 ? filteredAggRows.reduce((s, r) => s + Number(r.sgst || 0), 0) : totalSGST;
  }, [activeSubTab, filteredTaxCodeRows, filteredB2BRows, filteredB2CRows, filteredAggRows, rawMonthly, totalSGST]);

  const filteredTotalTax = filteredTotalIGST + filteredTotalCGST + filteredTotalSGST;

  // Chart data calculations
  const chartData = useMemo(() => {
    const rateGroups = {};
    taxCodeRows.forEach(r => {
      const rate = Number(r.taxRate || 0);
      const tax = Number(r.integratedTax || 0) + Number(r.centralTax || 0) + Number(r.stateTax || 0);
      if (tax > 0) {
        rateGroups[rate] = (rateGroups[rate] || 0) + tax;
      }
    });

    const total = Object.values(rateGroups).reduce((s, v) => s + v, 0);
    if (total === 0) return [];

    let currentAngle = 0;
    const colors = ['#f97316', '#0ea5e9', '#10b981', '#6366f1', '#ec4899', '#eab308'];

    return Object.entries(rateGroups).map(([rate, value], idx) => {
      const pct = value / total;
      const angle = pct * 360;
      const color = colors[idx % colors.length];
      const data = {
        rate: `${rate}%`,
        value,
        pct,
        angle,
        startAngle: currentAngle,
        color
      };
      currentAngle += angle;
      return data;
    });
  }, [taxCodeRows]);

  // Persistent Filing Status Tracker State
  const storageKey = useMemo(() => {
    const fromStr = period.from.split('T')[0];
    const toStr = period.to.split('T')[0];
    return `tax_filing_${selectedOrgId || 'all'}_${fromStr}_to_${toStr}`;
  }, [period, selectedOrgId]);

  const [filingStatus, setFilingStatus] = useState('PENDING');
  const [checklist, setChecklist] = useState({
    reviewSales: false,
    verifyCategories: false,
    reconcileB2b: false,
    exportCSV: false,
    filePortal: false
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFilingStatus(parsed.status || 'PENDING');
          setChecklist(parsed.checklist || {
            reviewSales: false,
            verifyCategories: false,
            reconcileB2b: false,
            exportCSV: false,
            filePortal: false
          });
        } catch {
          setFilingStatus('PENDING');
          setChecklist({
            reviewSales: false,
            verifyCategories: false,
            reconcileB2b: false,
            exportCSV: false,
            filePortal: false
          });
        }
      } else {
        setFilingStatus('PENDING');
        setChecklist({
          reviewSales: false,
          verifyCategories: false,
          reconcileB2b: false,
          exportCSV: false,
          filePortal: false
        });
      }
    }
  }, [storageKey]);

  const saveFilingState = (newStatus, newChecklist) => {
    setFilingStatus(newStatus);
    setChecklist(newChecklist);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify({
        status: newStatus,
        checklist: newChecklist
      }));
    }
  };

  const TaxDonutChart = () => {
    const totalTaxValue = chartData.reduce((s, item) => s + item.value, 0);
    
    if (chartData.length === 0) {
      return (
        <div className="donut-chart-container empty">
          <h3 className="widget-title">Tax Contribution</h3>
          <div className="empty-chart-text">No tax collection data to display.</div>
        </div>
      );
    }

    let cumulativePercentage = 0;

    return (
      <div className="donut-chart-container">
        <h3 className="widget-title">Tax Contribution</h3>
        <div className="donut-flex">
          <div className="donut-graphic-wrap">
            <svg width="140" height="140" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="35"
                fill="transparent"
                stroke="#f1f5f9"
                strokeWidth="10"
              />
              {chartData.map((item, idx) => {
                const strokeDasharray = `${item.pct * 219.91} 219.91`;
                const strokeDashoffset = -54.98 - (cumulativePercentage * 219.91);
                cumulativePercentage += item.pct;
                return (
                  <circle
                    key={idx}
                    cx="50"
                    cy="50"
                    r="35"
                    fill="transparent"
                    stroke={item.color}
                    strokeWidth="10"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="donut-segment"
                  />
                );
              })}
            </svg>
            <div className="donut-center-label">
              <span className="donut-center-title">Total Tax</span>
              <strong className="donut-center-value">{SYM}{fmt(totalTaxValue)}</strong>
            </div>
          </div>
          
          <div className="donut-legend">
            {chartData.map((item, idx) => (
              <div key={idx} className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: item.color }} />
                <span className="legend-label">{item.rate}</span>
                <span className="legend-value">{SYM}{fmt(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const FilingStatusTracker = () => {
    const handleStatusChange = (status) => {
      saveFilingState(status, checklist);
    };

    const toggleChecklistItem = (key) => {
      const updatedChecklist = { ...checklist, [key]: !checklist[key] };
      let updatedStatus = filingStatus;
      if (updatedChecklist[key] && filingStatus === 'PENDING') {
        updatedStatus = 'DRAFTED';
      }
      saveFilingState(updatedStatus, updatedChecklist);
    };

    const checklistCount = Object.values(checklist).filter(Boolean).length;
    const progressPercent = Math.round((checklistCount / 5) * 100);

    const checklistLabelMap = {
      reviewSales: 'Review taxable sales & rates',
      verifyCategories: 'Verify category codes (UOM/HSN)',
      reconcileB2b: 'Reconcile B2B client tax IDs',
      exportCSV: 'Export reporting category CSV',
      filePortal: 'File return on tax authority portal'
    };

    return (
      <div className="filing-tracker-container">
        <h3 className="widget-title">Filing Status Tracker</h3>
        
        <div className="filing-status-row">
          <button
            className={`status-pill pending ${filingStatus === 'PENDING' ? 'active' : ''}`}
            onClick={() => handleStatusChange('PENDING')}
          >
            Pending
          </button>
          <button
            className={`status-pill drafted ${filingStatus === 'DRAFTED' ? 'active' : ''}`}
            onClick={() => handleStatusChange('DRAFTED')}
          >
            Drafted
          </button>
          <button
            className={`status-pill filed ${filingStatus === 'FILED' ? 'active' : ''}`}
            onClick={() => handleStatusChange('FILED')}
          >
            Filed
          </button>
        </div>

        <div className="progress-section">
          <div className="progress-header flex-between">
            <span className="progress-label">Filing Progress</span>
            <span className="progress-percent">{progressPercent}%</span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="checklist-items">
          {Object.entries(checklistLabelMap).map(([key, label]) => {
            const isChecked = checklist[key];
            return (
              <label key={key} className={`checklist-item ${isChecked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleChecklistItem(key)}
                  className="checklist-cb"
                />
                <span className="checklist-text">{label}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  // CSV Export utility
  const exportCSV = (headers, rows, filename) => {
    if (!rows.length) return notify('error', 'No data to export');
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${period.from.split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportTaxCodeCSV = () => exportCSV(
    ['Tax Code', 'Description', 'UQC', 'Total Qty', 'Taxable Value', 'Central Tax', 'State/Local Tax', 'Cess'],
    taxCodeRows.map(r => [
      r.taxCode, r.description, r.uqc, r.totalQuantity,
      r.taxableValue.toFixed(2),
      r.centralTax.toFixed(2), r.stateTax.toFixed(2), r.cessAmount.toFixed(2)
    ].map(csvCell).join(',')),
    'Tax_Code_Summary'
  );

  const exportTaxReturnCSV = () => exportCSV(
    ['Nature of Supply', 'Taxable Value', 'Central Tax', 'State/Local Tax', 'Total Tax'],
    [['Outward Taxable Supplies', totalTaxable.toFixed(2), totalCGST.toFixed(2), totalSGST.toFixed(2), totalTax.toFixed(2)]].map(row => row.map(csvCell).join(',')),
    'Tax_Return_Summary'
  );

  const exportB2B = () => exportCSV(
    ['Tax ID of Recipient', 'Receiver Name', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Reverse Charge', 'Invoice Type', 'Rate (%)', 'Taxable Value', 'Central Tax', 'State Tax'],
    b2bInvoices.map(r => [
      r.taxId || '', r.receiverName || '', r.invoiceNo || '', r.invoiceDate || '',
      Number(r.invoiceValue || 0).toFixed(2), r.placeOfSupply || '', r.reverseCharge || 'N',
      r.invoiceType || 'Regular', Number(r.taxRate || 0), Number(r.taxableValue || 0).toFixed(2),
      Number(r.cgst || 0).toFixed(2), Number(r.sgst || 0).toFixed(2)
    ].map(csvCell).join(',')),
    'Tax_B2B'
  );

  const InfoTooltip = ({ id, text, direction = 'up' }) => {
    const isOpen = activeTooltip === id;
    const ref = React.useRef(null);
    const [coords, setCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
    const [arrowCoords, setArrowCoords] = useState({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });

    useEffect(() => {
      if (isOpen) {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const screenWidth = window.innerWidth;
          
          if (rect.left < 16) {
            setCoords({ left: '-16px', transform: 'none', right: 'auto' });
            setArrowCoords({ left: '20px', transform: 'none', right: 'auto' });
          } else if (rect.right > screenWidth - 16) {
            setCoords({ right: '-16px', left: 'auto', transform: 'none' });
            setArrowCoords({ right: '20px', left: 'auto', transform: 'none' });
          } else {
            setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
            setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
          }
        }
      } else {
        setCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
        setArrowCoords({ left: '50%', transform: 'translateX(-50%)', right: 'auto' });
      }
    }, [isOpen]);

    return (
      <span
        className="custom-tooltip-wrapper"
        onMouseEnter={() => {
          if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
            setActiveTooltip(id);
          }
        }}
        onMouseLeave={() => {
          if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
            if (activeTooltip === id) setActiveTooltip(null);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveTooltip(isOpen ? null : id);
        }}
      >
        <FaInfoCircle className={`custom-tooltip-icon ${isOpen ? 'active' : ''}`} />
        {isOpen && (
          <span ref={ref} className={`custom-tooltip-box dir-${direction}`} style={coords} onClick={(e) => e.stopPropagation()}>
            {text}
            <span className={`custom-tooltip-arrow dir-${direction}`} style={arrowCoords} />
          </span>
        )}
      </span>
    );
  };

  const taxSubTabs = [
    { 
      key: 'taxCode', 
      label: 'Sales by Tax Category', 
      tip: 'Sales Revenue & Tax Breakdown: Itemized view of transactions grouped by tax rates and category codes.' 
    },
    { 
      key: 'b2b', 
      label: 'Business Invoices', 
      tip: 'B2B Invoices: Detailed list of supplies made to registered business buyers with valid Tax IDs.' 
    },
    { 
      key: 'b2c', 
      label: 'Retail Sales Summary', 
      tip: 'Retail Sales: Aggregated summaries of supplies made to unregistered consumers (B2C).' 
    },
    { 
      key: 'aggregation', 
      label: 'Tax Reports by Month', 
      tip: 'Periodic Aggregation: Consolidated monthly or quarterly tax collections for simplified returns filing.' 
    },
  ];

  return (
    <DashboardLayout title="Tax Reports & Details" showBack={false}>
      <div className="tax-reports-page">
        {/* Date and branch filters (compact layout with back button) */}
        <div className="period-toolbar top-period-toolbar">
          <button 
            id="back_to_moneybook_btn"
            className="back-btn" 
            onClick={() => router.push('/owner/accounting')}
            title="Return to Money Book"
            style={{ width: '38px', height: '38px', padding: 0, justifyContent: 'center', flexShrink: 0 }}
          >
            <FaArrowLeft />
          </button>

          <div className="toolbar-filters-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <div className="filter-group">
              <FaCalendarAlt className="filter-icon" />
              <PremiumDateTimePicker value={period.from} onChange={(val) => val && setPeriod(p => ({ ...p, from: val }))} />
              <span className="period-sep">→</span>
              <PremiumDateTimePicker value={period.to} onChange={(val) => val && setPeriod(p => ({ ...p, to: val }))} />
            </div>

            {isSuperAdmin && (
              <div className="superadmin-filters" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="period-ctrl-sep" />
                <NiceSelect
                  value={selectedOrgId}
                  onChange={handleOrgChange}
                  options={[
                    { value: '', label: 'All Branches' },
                    ...organizations.map(o => ({ value: o.id, label: o.name }))
                  ]}
                  style={{ minWidth: 140, maxWidth: 170 }}
                />
                <NiceSelect
                  value={selectedTerminalId}
                  onChange={setSelectedTerminalId}
                  options={[
                    { value: '', label: 'All Terminals' },
                    ...filteredTerminals.map(t => ({ value: t.id, label: t.name + (t.terminalCode ? ` (${t.terminalCode})` : '') }))
                  ]}
                  style={{ minWidth: 140, maxWidth: 170 }}
                />
              </div>
            )}
          </div>
        </div>


        {/* KPI Strip */}
        <section className="tax-kpi-strip">
          <div className="tax-kpi-card" style={{ borderLeft: '4px solid #0ea5e9' }}>
            <span className="tax-kpi-label">
              Taxable Amount
              <InfoTooltip id="taxableAmountTip" text="Taxable Amount: Net sales value before tax component is calculated." />
            </span>
            <strong className="tax-kpi-val">{SYM}{fmt(totalTaxable)}</strong>
          </div>
          <div className="tax-kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
            <span className="tax-kpi-label">
              Total Central Tax
              <InfoTooltip id="centralTaxTip" text="Total Central Tax: Central government or federal share of tax collections." />
            </span>
            <strong className="tax-kpi-val">{SYM}{fmt(totalCGST)}</strong>
          </div>
          <div className="tax-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
            <span className="tax-kpi-label">
              Total State/Local Tax
              <InfoTooltip id="stateTaxTip" text="Total State/Local Tax: State, provincial, or local government share of tax collections." />
            </span>
            <strong className="tax-kpi-val">{SYM}{fmt(totalSGST)}</strong>
          </div>
          <div className="tax-kpi-card" style={{ borderLeft: '4px solid #ef4444', background: '#fef2f2' }}>
            <span className="tax-kpi-label" style={{ color: '#b91c1c' }}>
              Total Tax Payable
              <InfoTooltip id="totalTaxTip" text="Total Tax Payable: Combined sum of all tax components (Central + State/Local Tax) collected." />
            </span>
            <strong className="tax-kpi-val" style={{ color: '#dc2626', fontWeight: 900 }}>{SYM}{fmt(totalTax)}</strong>
          </div>
        </section>

        {/* Main Work Area */}
        <section className="workspace panel">
          {/* Action and Export toolbar */}
          <div className="panel-toolbar flex-between">
            <div className="title-block">
              <h1 className="section-title"><FaPercent /> Tax Summary</h1>
              <p className="section-helper">Filing-ready aggregates and tax return breakdown for the selected dates.</p>
            </div>
            <div className="export-buttons-group">
              <button id="toggle_filing_assistant_btn" className="tax-exp-btn assistant-btn" onClick={() => setShowFilingAssistant(true)}><FaChartPie /> Filing Assistant</button>
              <button id="print_report_btn" className="tax-exp-btn print-btn" onClick={() => typeof window !== 'undefined' && window.print()}><FaPrint /> Print Report</button>
              <button id="export_hsn_btn" className="tax-exp-btn" onClick={exportTaxCodeCSV}><FaFileCsv /> Export Category CSV</button>
              <button id="export_gstr3b_btn" className="tax-exp-btn" onClick={exportTaxReturnCSV}><FaFileCsv /> Export Return CSV</button>
              {b2bInvoices.length > 0 && (
                <button id="export_b2b_btn" className="tax-exp-btn" onClick={exportB2B}><FaFileCsv /> Export B2B CSV</button>
              )}
            </div>
          </div>

              {/* Sub-tab Pill Navigation */}
              <div className="tax-subtab-row">
                {taxSubTabs.map(st => (
                  <button 
                    key={st.key} 
                    className={`tax-subtab ${activeSubTab === st.key ? 'active' : ''}`} 
                    onClick={() => setActiveSubTab(st.key)}
                  >
                    {st.label}
                    <InfoTooltip id={`tip-subtab-${st.key}`} text={st.tip} />
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="loading-container">
                  <FaSync className="spin-icon" />
                  <span>Fetching tax breakdown records...</span>
                </div>
              ) : (
                <div className="tax-tab-content">
                  {/* Search & Filter Bar */}
                  <div className="tax-search-filter-bar">
                    <div className="search-input-wrap">
                      <input
                        type="text"
                        placeholder={
                          activeSubTab === 'taxCode' ? 'Search tax code or description...' :
                          activeSubTab === 'b2b' ? 'Search customer, invoice, tax ID...' :
                          activeSubTab === 'b2c' ? 'Search sale type, supply location...' :
                          'Search period...'
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="tax-search-input"
                      />
                    </div>
                    
                    {activeSubTab !== 'aggregation' && (
                      <div className="filter-dropdown-wrap">
                        <NiceSelect
                          value={selectedRateFilter}
                          onChange={setSelectedRateFilter}
                          options={[
                            { value: '', label: 'All Tax Rates' },
                            ...uniqueRates.map(rate => ({ value: String(rate), label: `${rate}% Rate` }))
                          ]}
                          style={{ minWidth: 150 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* SUBTAB 1: Sales by Tax Category */}
                  {activeSubTab === 'taxCode' && (
                    <div className="rpt-tbl-wrap">
                      <div className="tax-table-note">Sales Revenue & Tax Breakdown by Category</div>
                      {filteredTaxCodeRows.length === 0 ? (
                        <div className="empty-cell">
                          {taxCodeRows.length === 0 
                            ? 'No tax data found for the selected range. Ensure tax settings are applied to products.' 
                            : 'No matching records found for the active search query or selected tax rate filter.'}
                        </div>
                      ) : (
                        <table className="rpt-tbl">
                          <thead>
                            <tr>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Tax Code
                                  <InfoTooltip id="hdrTaxCode" text="Tax Code: The specific tariff or rate code category." direction="down" />
                                </span>
                              </th>
                              <th>Description</th>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Unit (UOM)
                                  <InfoTooltip id="hdrUqc" text="Unit of Measure: Standard code for item packaging/measurement unit." direction="down" />
                                </span>
                              </th>
                              <th className="amount">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  Quantity
                                  <InfoTooltip id="hdrQty" text="Quantity: Total items or units sold in this category." direction="down" />
                                </span>
                              </th>
                              <th className="amount">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  Tax Rate
                                  <InfoTooltip id="hdrRate" text="Tax Rate: Percentage rate applied to items." direction="down" />
                                </span>
                              </th>
                              <th className="amount">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  Taxable Sales
                                  <InfoTooltip id="hdrTaxableVal" text="Taxable Sales: Total sales amount before adding tax components." direction="down" />
                                </span>
                              </th>
                              <th className="amount">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  Federal/Central Tax
                                  <InfoTooltip id="hdrCentral" text="Federal/Central Tax: Tax component for the central government." direction="down" />
                                </span>
                              </th>
                              <th className="amount">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  State/Local Tax
                                  <InfoTooltip id="hdrState" text="State/Local Tax: Tax component for the state, province, or local municipality." direction="down" />
                                </span>
                              </th>
                              <th className="amount">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  Total Tax
                                  <InfoTooltip id="hdrTotalTax" text="Total Tax: Combined sum of all tax components." direction="down" />
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTaxCodeRows.map((r, i) => (
                              <tr key={i}>
                                <td><span className="mono">{r.taxCode}</span></td>
                                <td>{r.description}</td>
                                <td><span className="type-pill">{r.uqc}</span></td>
                                <td className="amount">{r.totalQuantity.toFixed(2)}</td>
                                <td className="amount"><span className="type-pill tax">{r.taxRate}%</span></td>
                                <td className="amount">{SYM}{fmt(r.taxableValue)}</td>
                                <td className="amount">{SYM}{fmt(r.centralTax)}</td>
                                <td className="amount">{SYM}{fmt(r.stateTax)}</td>
                                <td className="amount" style={{ fontWeight: 900 }}>{SYM}{fmt(r.integratedTax + r.centralTax + r.stateTax)}</td>
                              </tr>
                            ))}
                            <tr className="tax-total-row">
                              <td colSpan={5}>
                                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  TOTAL
                                  <InfoTooltip id="totalSummaryTip" text="Total values for the selected period across all tax categories." />
                                </strong>
                              </td>
                              <td className="amount"><strong>{SYM}{fmt(filteredTotalTaxable)}</strong></td>
                              <td className="amount"><strong>{SYM}{fmt(filteredTotalCGST)}</strong></td>
                              <td className="amount"><strong>{SYM}{fmt(filteredTotalSGST)}</strong></td>
                              <td className="amount" style={{ fontWeight: 900 }}><strong>{SYM}{fmt(filteredTotalTax)}</strong></td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* SUBTAB 2: Business Invoices */}
                  {activeSubTab === 'b2b' && (
                    <div className="rpt-tbl-wrap">
                      <div className="tax-table-note">Invoices Issued to Business Clients (B2B)</div>
                      {filteredB2BRows.length === 0 ? (
                        <div className="empty-cell">
                          {b2bInvoices.length === 0 
                            ? 'No business invoices found for this period. To issue a B2B invoice, ensure the customer has a Business Tax ID configured.' 
                            : 'No matching business invoices found for the active search query or selected tax rate filter.'}
                          {!taxReportData && <div className="note-text">Detailed B2B split requires the backend tax summary configuration.</div>}
                        </div>
                      ) : (
                        <table className="rpt-tbl">
                          <thead>
                            <tr>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Business Tax ID
                                  <InfoTooltip id="hdrB2bTaxId" text="Business Tax ID: The buyer's official tax registration number." direction="down" />
                                </span>
                              </th>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Customer Name
                                  <InfoTooltip id="hdrB2bCust" text="Customer Name: Registered business name of the client." direction="down" />
                                </span>
                              </th>
                              <th>Invoice No</th>
                              <th>Date</th>
                              <th className="amount">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  Total Invoiced
                                  <InfoTooltip id="hdrB2bVal" text="Total Invoiced: The grand total of the transaction, including all taxes." direction="down" />
                                </span>
                              </th>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Supply Location
                                  <InfoTooltip id="hdrB2bPos" text="Supply Location: Destination state or region for tax jurisdiction." direction="down" />
                                </span>
                              </th>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Reverse Charge
                                  <InfoTooltip id="hdrB2bRev" text="Reverse Charge: YES if tax is payable by buyer directly, NO otherwise." direction="down" />
                                </span>
                              </th>
                              <th>Invoice Type</th>
                              <th className="amount">Tax Rate</th>
                              <th className="amount">Taxable Sales</th>
                              <th className="amount">Federal/Central Tax</th>
                              <th className="amount">State/Local Tax</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredB2BRows.map((r, i) => (
                              <tr key={i}>
                                <td><span className="mono">{r.taxId || '—'}</span></td>
                                <td>{r.receiverName || '—'}</td>
                                <td><span className="mono">{r.invoiceNo || '—'}</span></td>
                                <td>{r.invoiceDate || '—'}</td>
                                <td className="amount">{SYM}{fmt(r.invoiceValue)}</td>
                                <td>{r.placeOfSupply || '—'}</td>
                                <td>{r.reverseCharge || 'N'}</td>
                                <td><span className="type-pill">{r.invoiceType || 'Regular'}</span></td>
                                <td className="amount"><span className="type-pill tax">{r.taxRate}%</span></td>
                                <td className="amount">{SYM}{fmt(r.taxableValue)}</td>
                                <td className="amount">{SYM}{fmt(r.cgst)}</td>
                                <td className="amount" style={{ fontWeight: 900 }}>{SYM}{fmt(r.sgst)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* SUBTAB 3: Retail Sales Summary */}
                  {activeSubTab === 'b2c' && (
                    <div className="rpt-tbl-wrap">
                      <div className="tax-table-note">Sales to Retail Consumers (B2C)</div>
                      {filteredB2CRows.length === 0 ? (
                        <div className="empty-cell">
                          No matching B2C sales summary records found for the active search query or selected tax rate filter.
                        </div>
                      ) : (
                        <table className="rpt-tbl">
                          <thead>
                            <tr>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Sale Type
                                  <InfoTooltip id="hdrB2cType" text="Sale Type: Consumer transaction category." direction="down" />
                                </span>
                              </th>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Supply Location
                                  <InfoTooltip id="hdrB2cPos" text="Supply Location: Destination state or region." direction="down" />
                                </span>
                              </th>
                              <th className="amount">Tax Rate</th>
                              <th className="amount">Taxable Sales</th>
                              <th className="amount">Federal/Central Tax</th>
                              <th className="amount">State/Local Tax</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredB2CRows.map((r, i) => (
                              <tr key={i}>
                                <td><span className="type-pill">{r.type || 'B2C (Others)'}</span></td>
                                <td>{r.placeOfSupply || '—'}</td>
                                <td className="amount"><span className="type-pill tax">{r.taxRate}%</span></td>
                                <td className="amount">{SYM}{fmt(r.taxableValue)}</td>
                                <td className="amount">{SYM}{fmt(r.cgst)}</td>
                                <td className="amount" style={{ fontWeight: 900 }}>{SYM}{fmt(r.sgst)}</td>
                              </tr>
                            ))}
                            <tr className="tax-total-row">
                              <td colSpan={3}>
                                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  TOTAL
                                  <InfoTooltip id="totalB2CSummaryTip" text="Total values for all retail sales (B2C) in the selected period." />
                                </strong>
                              </td>
                              <td className="amount"><strong>{SYM}{fmt(filteredTotalTaxable)}</strong></td>
                              <td className="amount"><strong>{SYM}{fmt(filteredTotalCGST)}</strong></td>
                              <td className="amount" style={{ fontWeight: 900 }}><strong>{SYM}{fmt(filteredTotalSGST)}</strong></td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                      {!taxReportData && <div className="helper-label">Showing tax slab aggregates as fallback. Populate B2C records on transactions for precise Place of Supply.</div>}
                    </div>
                  )}

                  {/* SUBTAB 4: Tax Reports by Month */}
                  {activeSubTab === 'aggregation' && (
                    <div className="rpt-tbl-wrap">
                      <div className="tax-agg-header flex-between">
                        <div className="tax-table-note">Periodic Tax Summaries</div>
                        <div className="tax-subtab-row mini">
                          <button className={`tax-subtab ${taxAggregation === 'monthly' ? 'active' : ''}`} onClick={() => setTaxAggregation('monthly')}>Monthly</button>
                          <button className={`tax-subtab ${taxAggregation === 'quarterly' ? 'active' : ''}`} onClick={() => setTaxAggregation('quarterly')}>Quarterly</button>
                        </div>
                      </div>
                      {filteredAggRows.length === 0 && rawMonthly.length > 0 ? (
                        <div className="empty-cell">No matching periodic summaries found for the active search query.</div>
                      ) : (
                        <table className="rpt-tbl">
                          <thead>
                            <tr>
                              <th>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  Period
                                  <InfoTooltip id="hdrAggPeriod" text="Period: The calendar month or quarter for tax filing." direction="down" />
                                </span>
                              </th>
                              <th className="amount">Taxable Sales</th>
                              <th className="amount">Federal/Central Tax</th>
                              <th className="amount">State/Local Tax</th>
                              <th className="amount">Total Tax</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rawMonthly.length > 0 ? filteredAggRows.map((r, i) => (
                              <tr key={i}>
                                <td><strong>{r.period}</strong></td>
                                <td className="amount">{SYM}{fmt(r.taxableValue)}</td>
                                <td className="amount">{SYM}{fmt(r.cgst)}</td>
                                <td className="amount">{SYM}{fmt(r.sgst)}</td>
                                <td className="amount" style={{ fontWeight: 900 }}><strong>{SYM}{fmt(Number(r.igst || 0) + Number(r.cgst || 0) + Number(r.sgst || 0))}</strong></td>
                              </tr>
                            )) : (
                              <tr className="tax-total-row">
                                <td>
                                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    Selected Period Total
                                    <InfoTooltip id="totalPeriodSummaryTip" text="Aggregated totals for the selected search period." />
                                  </strong>
                                </td>
                                <td className="amount">{SYM}{fmt(filteredTotalTaxable)}</td>
                                <td className="amount">{SYM}{fmt(filteredTotalCGST)}</td>
                                <td className="amount">{SYM}{fmt(filteredTotalSGST)}</td>
                                <td className="amount" style={{ fontWeight: 900 }}><strong>{SYM}{fmt(filteredTotalTax)}</strong></td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      )}
                      {rawMonthly.length === 0 && <div className="helper-label">Expand your search date range to see periodic aggregation breakdown.</div>}
                    </div>
                  )}
                </div>
              )}
            </section>

        {/* Slide-out Filing Assistant Drawer overlay */}
        <div className={`drawer-overlay ${showFilingAssistant ? 'open' : ''}`} onClick={() => setShowFilingAssistant(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header flex-between">
              <h2 className="drawer-title"><FaChartPie /> Filing Assistant</h2>
              <button className="drawer-close-btn" onClick={() => setShowFilingAssistant(false)}>×</button>
            </div>
            <div className="drawer-body">
              {TaxDonutChart()}
              {FilingStatusTracker()}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .tax-reports-page {
          padding: 24px 40px;
          min-height: calc(100vh - 80px);
          background: #f8fafc;
          color: #0f172a;
        }

        .page-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1.5px solid #fdba74;
          background: #ffffff;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 13.5px;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
        }

        .back-btn:hover {
          background: #fff7ed;
          border-color: #f97316;
          color: #f97316;
          transform: translateX(-2px);
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.08);
        }

        .header-badge {
          background: #e0f2fe;
          color: #0369a1;
          font-size: 11px;
          font-weight: 900;
          padding: 4px 10px;
          border-radius: 99px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .top-period-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 24px;
          background: #fff;
          padding: 12px 20px;
          border-radius: 16px;
          border: 1px solid #f1f5f9;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.01);
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .filter-icon {
          color: #94a3b8;
          font-size: 16px;
        }

        .period-sep {
          color: #cbd5e1;
          font-weight: 800;
        }

        .period-ctrl-sep {
          width: 1.5px;
          height: 24px;
          background: #e2e8f0;
          margin: 0 8px;
        }

        .superadmin-filters {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .icon-button {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .icon-button:hover {
          color: #f97316;
          border-color: #fed7aa;
          background: #fff7ed;
        }

        /* Drawer Layout */
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.3);
          backdrop-filter: blur(4px);
          z-index: 99999;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .drawer-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }
        .drawer-content {
          position: absolute;
          top: 0;
          right: 0;
          width: 380px;
          max-width: 90vw;
          height: 100vh;
          background: #ffffff;
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .drawer-overlay.open .drawer-content {
          transform: translateX(0);
        }
        .drawer-header {
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
        }
        .drawer-title {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .drawer-close-btn {
          border: none;
          background: none;
          font-size: 24px;
          font-weight: 300;
          color: #94a3b8;
          cursor: pointer;
          transition: color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
        }
        .drawer-close-btn:hover {
          color: #ea580c;
          background: #fff7ed;
        }
        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .tax-exp-btn.assistant-btn {
          background: #fffbeb;
          border-color: #fde68a;
          color: #d97706;
        }
        .tax-exp-btn.assistant-btn:hover {
          background: #fef3c7;
          border-color: #f59e0b;
          color: #b45309;
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.08);
        }


        /* Search & Filter Bar */
        .tax-search-filter-bar {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
          align-items: center;
          flex-wrap: wrap;
        }
        .search-input-wrap {
          flex: 1;
          min-width: 200px;
        }
        .tax-search-input {
          width: 100%;
          padding: 9px 16px;
          border-radius: 12px;
          border: 1.5px solid #e2e8f0;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          outline: none;
          transition: all 0.2s ease;
        }
        .tax-search-input:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
        }
        .filter-dropdown-wrap {
          display: flex;
          align-items: center;
        }

        /* Widgets Card base */
        :global(.donut-chart-container), :global(.filing-tracker-container) {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          padding: 22px;
          box-shadow: 0 4px 18px rgba(0,0,0,0.015);
        }
        :global(.widget-title) {
          font-size: 11px;
          font-weight: 900;
          color: #64748b;
          margin: 0 0 16px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Donut Chart Styling */
        :global(.donut-flex) {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        :global(.donut-graphic-wrap) {
          position: relative;
          width: 140px;
          height: 140px;
        }
        :global(.donut-segment) {
          transition: stroke-dashoffset 0.35s ease;
        }
        :global(.donut-center-label) {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          pointer-events: none;
          width: 90px;
        }
        :global(.donut-center-title) {
          font-size: 9px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
        }
        :global(.donut-center-value) {
          font-size: 13px;
          font-weight: 900;
          color: #0f172a;
          margin-top: 2px;
          word-break: break-word;
        }
        :global(.donut-legend) {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
          border-top: 1px dashed #e2e8f0;
          padding-top: 14px;
        }
        :global(.legend-item) {
          display: flex;
          align-items: center;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        :global(.legend-dot) {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 8px;
        }
        :global(.legend-label) {
          flex: 1;
        }
        :global(.legend-value) {
          color: #0f172a;
          font-weight: 800;
        }
        :global(.empty-chart-text) {
          font-size: 12px;
          color: #94a3b8;
          text-align: center;
          padding: 30px 10px;
          font-weight: 700;
        }

        /* Filing Status Tracker */
        :global(.filing-status-row) {
          display: flex;
          gap: 8px;
          margin-bottom: 18px;
        }
        :global(.status-pill) {
          flex: 1;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 8px 0;
          border-radius: 10px;
          font-size: 11.5px;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s ease;
        }
        :global(.status-pill.pending:hover), :global(.status-pill.pending.active) {
          border-color: #ef4444;
          background: #fef2f2;
          color: #b91c1c;
        }
        :global(.status-pill.drafted:hover), :global(.status-pill.drafted.active) {
          border-color: #f59e0b;
          background: #fffbeb;
          color: #b45309;
        }
        :global(.status-pill.filed:hover), :global(.status-pill.filed.active) {
          border-color: #10b981;
          background: #ecfdf5;
          color: #047857;
        }
        
        :global(.progress-section) {
          margin-bottom: 20px;
        }
        :global(.progress-header) {
          margin-bottom: 6px;
        }
        :global(.progress-label) {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
        }
        :global(.progress-percent) {
          font-size: 11.5px;
          font-weight: 800;
          color: #f97316;
        }
        :global(.progress-bar-wrap) {
          height: 6px;
          background: #f1f5f9;
          border-radius: 99px;
          overflow: hidden;
        }
        :global(.progress-bar-fill) {
          height: 100%;
          background: linear-gradient(90deg, #f97316, #ea580c);
          border-radius: 99px;
          transition: width 0.3s ease;
        }

        :global(.checklist-items) {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        :global(.checklist-item) {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          transition: color 0.2s ease;
        }
        :global(.checklist-item:hover) {
          color: #0f172a;
        }
        :global(.checklist-item.checked) {
          color: #94a3b8;
          text-decoration: line-through;
        }
        :global(.checklist-cb) {
          margin-top: 3px;
          cursor: pointer;
          accent-color: #ea580c;
        }
        :global(.checklist-text) {
          line-height: 1.4;
        }

        /* Print Button specific styles */
        .tax-exp-btn.print-btn {
          border-color: #cbd5e1;
          color: #475569;
        }
        .tax-exp-btn.print-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #1e293b;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        /* KPI cards grid styling */
        .tax-kpi-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 18px;
          margin-bottom: 28px;
        }

        .tax-kpi-card {
          position: relative;
          z-index: 1;
          background: #ffffff;
          padding: 20px 22px;
          border-radius: 16px;
          border: 1px solid #f1f5f9;
          display: flex;
          flex-direction: column;
          gap: 6px;
          box-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.02);
          transition: transform 0.2s, box-shadow 0.2s, z-index 0.2s;
        }

        .tax-kpi-card:hover,
        .tax-kpi-card:focus-within,
        .tax-kpi-card:has(.custom-tooltip-icon.active) {
          z-index: 25;
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.03);
        }

        .tax-kpi-label {
          font-size: 10.5px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* Tooltip styles */
        .custom-tooltip-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 6px;
          z-index: 30;
        }
        :global(.custom-tooltip-wrapper) {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 6px;
          z-index: 30;
        }
        :global(.custom-tooltip-icon) {
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        :global(.custom-tooltip-icon:hover),
        :global(.custom-tooltip-icon.active) {
          color: #f97316;
          transform: scale(1.15);
        }
        :global(.custom-tooltip-box) {
          position: absolute;
          width: 240px;
          background: #ea580c;
          color: #ffffff;
          padding: 12px 14px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.5;
          box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3), 0 4px 6px rgba(0, 0, 0, 0.05);
          z-index: 100000;
          white-space: normal;
          text-align: left;
          text-transform: none;
          animation: tooltip-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        :global(.custom-tooltip-box.dir-up) {
          bottom: 135%;
        }
        :global(.custom-tooltip-box.dir-down) {
          top: 135%;
        }
        :global(.custom-tooltip-arrow) {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
        }
        :global(.custom-tooltip-arrow.dir-up) {
          bottom: -6px;
          border-top: 6px solid #ea580c;
        }
        :global(.custom-tooltip-arrow.dir-down) {
          top: -6px;
          border-bottom: 6px solid #ea580c;
        }
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .tax-kpi-val {
          font-size: 22px;
          font-weight: 900;
          color: #0f172a;
          line-height: 1.1;
        }

        /* Workspace and Inner layouts */
        .workspace {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          padding: 24px;
          box-shadow: 0 4px 18px rgba(0,0,0,0.015);
        }

        .flex-between {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .section-title {
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
        }

        .section-helper {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
          margin: 4px 0 0;
        }

        .export-buttons-group {
          display: flex;
          gap: 8px;
        }

        .tax-exp-btn {
          min-height: 38px;
          height: 38px;
          padding: 0 16px;
          font-size: 12.5px;
          border-radius: 12px;
          border: 1.5px solid #fdba74;
          background: #ffffff;
          color: #475569;
          cursor: pointer;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .tax-exp-btn:hover {
          background: #fffdfa;
          border-color: #f97316;
          color: #f97316;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.08);
        }

        .tax-subtab-row {
          display: flex;
          gap: 8px;
          padding: 8px 0;
          border-bottom: 1.5px solid #eef2f7;
          margin-top: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .tax-subtab-row.mini {
          border-bottom: none;
          margin: 0;
          padding: 0;
        }

        .tax-subtab {
          background: #ffffff;
          border: 1px solid #f1f5f9;
          padding: 8px 18px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .tax-subtab:hover {
          background: #f8fafc;
          color: #334155;
          border-color: #cbd5e1;
        }

        .tax-subtab.active {
          background: #fffdfa;
          color: #ea580c;
          border: 1.5px solid #fdba74;
          box-shadow: 0 4px 12px rgba(234, 88, 12, 0.05);
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 60px 20px;
          color: #64748b;
          font-weight: 700;
        }

        .spin-icon {
          font-size: 24px;
          animation: spin 1s linear infinite;
          color: #f97316;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* GSTR reports table styling */
        .tax-table-note {
          font-size: 12.5px;
          font-weight: 800;
          color: #475569;
          margin-bottom: 14px;
          border-left: 3px solid #f97316;
          padding-left: 10px;
          letter-spacing: -0.01em;
        }

        .rpt-tbl-wrap {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          overflow: auto;
          box-shadow: 0 1px 3px rgba(0, 0, 0, .02);
          padding: 16px;
        }

        .rpt-tbl {
          width: 100%;
          border-collapse: collapse;
          min-width: 900px;
        }

        .rpt-tbl th {
          background: #fff;
          padding: 12px;
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: .05em;
          border-bottom: 2px solid #ea580c;
        }

        .rpt-tbl td {
          padding: 12px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
          color: #475569;
          vertical-align: middle;
          white-space: nowrap;
        }

        .rpt-tbl tbody tr {
          cursor: default;
          transition: background .15s;
        }

        .rpt-tbl tbody tr:hover td {
          background: #fffbf5;
        }

        .rpt-tbl tr:last-child td {
          border-bottom: none;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-weight: 800;
          color: #0f172a;
        }

        .amount {
          text-align: right;
          font-weight: 800;
          color: #0f172a;
        }

        .rpt-tbl th.amount {
          text-align: right;
          font-weight: 600;
          color: #64748b;
        }

        .tax-total-row td {
          background: #fcfcfc !important;
          font-weight: 800 !important;
          color: #1e293b !important;
          border-top: 1.5px solid #e2e8f0 !important;
          border-bottom: 1.5px solid #e2e8f0 !important;
        }

        .type-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 6px;
          padding: 2px 8px;
          background: #f1f5f9;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .type-pill.tax {
          background: #fff7ed;
          color: #ea580c;
        }

        .empty-cell {
          text-align: center;
          color: #94a3b8;
          padding: 48px 16px;
          font-size: 13.5px;
          font-weight: 700;
        }

        .note-text, .helper-label {
          margin-top: 10px;
          font-size: 11.5px;
          color: #94a3b8;
          font-weight: 600;
        }

        /* Mobile adaptation */
        @media (max-width: 980px) {
          .tax-reports-page {
            padding: 12px;
          }
          .tax-reports-grid {
            grid-template-columns: 1fr;
          }
          .top-period-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          .tax-kpi-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .panel-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 14px;
          }
          .export-buttons-group {
            flex-direction: column;
            align-items: stretch;
          }
          .tax-exp-btn {
            width: 100%;
            justify-content: center;
          }
          .tax-agg-header {
            flex-direction: column;
            align-items: stretch;
          }
          .tax-subtab-row.mini {
            width: 100%;
          }
          .tax-subtab-row.mini .tax-subtab {
            flex: 1;
            justify-content: center;
          }
        }

        @media (max-width: 560px) {
          .tax-kpi-strip {
            grid-template-columns: 1fr;
          }
          .superadmin-filters {
            flex-direction: column;
            align-items: stretch;
          }
        }

        /* Print styles */
        @media print {
          :global(header), :global(nav), :global(.sidebar), :global(.dashboard-header), :global(.left-nav), :global(.top-bar) {
            display: none !important;
          }
          .back-btn, .top-period-toolbar, .export-buttons-group, .tax-subtab-row, .tax-reports-sidebar, .helper-label, .tax-table-note, :global(.custom-tooltip-wrapper), .drawer-overlay {
            display: none !important;
          }
          .tax-reports-page {
            padding: 0 !important;
            background: #ffffff !important;
            min-height: auto !important;
          }
          .workspace {
            border: none !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .tax-reports-grid {
            display: block !important;
          }
          .tax-reports-main {
            width: 100% !important;
          }
          .rpt-tbl-wrap {
            border: none !important;
            padding: 0 !important;
            overflow: visible !important;
            box-shadow: none !important;
          }
          .rpt-tbl {
            min-width: 100% !important;
            width: 100% !important;
          }
          .rpt-tbl th, .rpt-tbl td {
            font-size: 10pt !important;
            padding: 8px !important;
            color: #000000 !important;
            border-bottom: 1px solid #ddd !important;
          }
          .rpt-tbl th {
            border-top: 1px solid #000 !important;
            border-bottom: 2px solid #000 !important;
          }
          .tax-total-row td {
            border-top: 2px solid #000 !important;
            border-bottom: 2px solid #000 !important;
            background: transparent !important;
          }
          .tax-kpi-strip {
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 10px !important;
            margin-bottom: 20px !important;
            page-break-inside: avoid;
          }
          .tax-kpi-card {
            border: 1px solid #ccc !important;
            padding: 10px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            transform: none !important;
          }
          .tax-kpi-val {
            font-size: 14pt !important;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}
