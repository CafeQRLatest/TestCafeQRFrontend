import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../components/DashboardLayout';
import PremiumDateTimePicker from '../../components/PremiumDateTimePicker';
import api from '../../utils/api';
import { 
  FaSearch, FaShoppingCart, FaPlus, FaMinus, FaTrash, FaArrowLeft, FaRedo, FaCheck, FaTimes, 
  FaUtensils, FaShoppingBag, FaMotorcycle, FaChair, FaUser, FaUsers, FaWallet, FaFire,
  FaCubes, FaUserPlus, FaBoxOpen, FaChevronUp, FaChevronDown, FaReceipt, FaCreditCard, FaCashRegister,
  FaExpand, FaCompress, FaExclamationCircle, FaEdit, FaClock
} from 'react-icons/fa';
import { calculateOrderTotals } from '../../utils/orderCalculations';
import ReportTable from '../../components/ReportTable';
import { useAuth } from '../../context/AuthContext';
import { buildReceiptText, parseDate } from '../../utils/printUtils';
import { printUniversal } from '../../utils/printGateway';
import KotPrint from '../../components/KotPrint';

const FULFILLMENT = [
  { key: 'DINE_IN',  label: 'Dine In',  icon: <FaUtensils/>,  color: '#f97316' },
  { key: 'TAKEAWAY', label: 'Takeaway', icon: <FaShoppingBag/>, color: '#16a34a' },
  { key: 'DELIVERY', label: 'Delivery', icon: <FaMotorcycle/>, color: '#0ea5e9' }
];

export default function Sales() {
  const router = useRouter();
  const { userRole } = useAuth();
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingOrderNo, setEditingOrderNo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeCat, setActiveCat] = useState('ALL');
  const [activeFloor, setActiveFloor] = useState('ALL');
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [fulfillmentType, setFulfillmentType] = useState('TAKEAWAY');
  const [tableNumber, setTableNumber] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [phase, setPhase] = useState('table');
  const [orderMode, setOrderMode] = useState('settle');
  const [paymentMode, setPaymentMode] = useState('settle');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [settledAmount, setSettledAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [opMode, setOpMode] = useState('pos'); // pos, kitchen, tables, history
  const [orderTime, setOrderTime] = useState(new Date().toISOString().slice(0, 16));
  const [isFS, setIsFS] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);
  const [printKind, setPrintKind] = useState('bill');

  const themeColor = (opMode === 'kitchen' || (opMode === 'pos' && orderMode === 'kitchen')) ? '#f97316' : (opMode === 'pos' && orderMode === 'credit') ? '#6366f1' : '#16a34a';
  const themeRGB = (opMode === 'kitchen' || (opMode === 'pos' && orderMode === 'kitchen')) ? '249, 115, 22' : (opMode === 'pos' && orderMode === 'credit') ? '99, 102, 241' : '22, 163, 74';

  // Modals
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showQuickProduct, setShowQuickProduct] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrderData, setEditingOrderData] = useState(null);

  // New Cust/Prod states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [custSaving, setCustSaving] = useState(false);
  const [qpName, setQpName] = useState('');
  const [qpPrice, setQpPrice] = useState('');
  const [qpCat, setQpCat] = useState('');
  const [qpCode, setQpCode] = useState('');
  const [qpTax, setQpTax] = useState('');
  const [qpVeg, setQpVeg] = useState(true);
  const [qpPkg, setQpPkg] = useState(false);
  const [qpSaving, setQpSaving] = useState(false);
  const [discount, setDiscount] = useState({ type: 'amount', value: 0 });
  const [discountTab, setDiscountTab] = useState('order'); // 'order' | 'line'
  const [selectedTable, setSelectedTable] = useState(null);
  const [showTableActions, setShowTableActions] = useState(false);
  const [activeOrderDetails, setActiveOrderDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [kitchenFilter, setKitchenFilter] = useState('TAKEAWAY'); // TAKEAWAY, DELIVERY
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const searchRef = useRef(null);
  const custZoneRef = useRef(null);
  const prodZoneRef = useRef(null);
  const [showProdSuggestions, setShowProdSuggestions] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (custZoneRef.current && !custZoneRef.current.contains(event.target)) setShowSuggestions(false);
      if (prodZoneRef.current && !prodZoneRef.current.contains(event.target)) setShowProdSuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [p, t, c, cfg] = await Promise.all([
          api.get('/api/v1/products'),
          api.get('/api/v1/tables'),
          api.get('/api/v1/purchasing/customers'),
          api.get('/api/v1/configurations')
        ]);
        setProducts(p.data.data || []);
        setTables(t.data.data || []);
        setCustomers(c.data.data || []);
        const cfgD = cfg.data.data;
        setConfig(cfgD);
        
        const tableMgmt = !!cfgD?.tableManagementEnabled;
        setPhase(tableMgmt ? 'table' : 'pos');
        setFulfillmentType(tableMgmt ? 'DINE_IN' : 'TAKEAWAY');
        if(cfgD?.sendToKitchenEnabled) setOrderMode('kitchen');
      } catch { 
        showToast('Failed to load data', 'error'); 
      } finally { 
        setLoading(false); 
      }
    })();
  }, []);

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const statuses = opMode === 'history' ? 'COMPLETED,PAID' : 'KITCHEN,CONFIRMED';
      const r = await api.get(`/api/v1/orders?status=${statuses}`);
      setAllOrders(r.data.data || []);
    } catch (e) {
      console.error('Failed to fetch orders', e);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadOrderForEdit = async (orderId) => {
    try {
      showToast('Loading Order...');
      const { data: { data: order } } = await api.get(`/api/v1/orders/${orderId}`);
      if (!order) return;
      
      setFulfillmentType(order.fulfillmentType);
      setTableNumber(order.tableNumber || '');
      setOrderTime(new Date(order.orderDate).toISOString().slice(0, 16));
      
      const mappedCart = order.lines.map(l => ({
        pid: l.productId,
        name: l.productName,
        price: l.unitPrice,
        qty: l.quantity,
        tax: l.taxRate,
        uom: l.unitOfMeasure,
        lineDiscount: l.discountAmount || 0,
        is_packaged: l.isPackagedGood
      }));
      
      console.log('Order Data Loaded:', order);
      setCart(mappedCart);
      setDiscount({ type: 'amount', value: order.totalDiscountAmount || 0 });
      setEditingOrderId(order.id);
      setEditingOrderNo(order.orderNo);
      setEditingOrderData({ ...order, lines: mappedCart, originalLines: JSON.parse(JSON.stringify(mappedCart)) });
      setShowEditModal(true);
      console.log('Modal State Set to True');
      showToast('Order Ready for Review');
    } catch (e) {
      console.error('Load Order Error:', e);
      showToast(`Load Failed: ${e.response?.data?.message || e.message}`, 'error');
    }
  };

  useEffect(() => {
    if (opMode === 'kitchen' || opMode === 'tables' || opMode === 'history') {
      fetchOrders();
      if (opMode !== 'history') {
        const interval = setInterval(fetchOrders, 30000);
        return () => clearInterval(interval);
      }
    }
  }, [opMode]);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };
  const tableOn    = config?.tableManagementEnabled === true;
  const imagesOn   = config?.menuImagesEnabled === true;
  const taxOn      = config?.taxEnabled === true;
  const taxSplitOn = config?.taxSplitEnabled === true;
  const listingOn  = config?.posProductListingEnabled !== false;
  const discountOn = config?.discountEnabled !== false;
  const kitchenOn  = config?.sendToKitchenEnabled === true;
  const creditOn   = config?.creditEnabled === true;
  const customerOn = config?.customersEnabled === true;
  const roundOn    = config?.roundOffEnabled === true;
  const pricesInclTax = config?.pricesIncludeTax === true;
  const roundMode  = config?.roundOffMode || 'automatic';
  const roundFactor= parseFloat(config?.roundOffAutoFactor) || 1;
  const roundLimit = parseFloat(config?.roundOffManualLimit) || 10;
  const sym        = config?.currencySymbol || '₹';

  const defaultTaxRate = useMemo(() => {
    if (!taxOn) return 0;
    const rates = config?.taxRates || [];
    const def = config?.taxDefaultId;
    const f = rates.find(r => r.id === def);
    return f ? parseFloat(f.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
  }, [config, taxOn]);
  const taxLabel = config?.taxLabelGlobal || 'Tax';

  const THEME = orderMode === 'kitchen' 
    ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed', rgb: '249,115,22' }
    : orderMode === 'credit'
    ? { main: '#6366f1', dark: '#4f46e5', soft: '#e0e7ff', rgb: '99,102,241' }
    : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3', rgb: '22,163,74' };

  const addToCart = useCallback(product => {
    setCart(prev => {
      const ex = prev.find(c => c.pid === product.id);
      if (ex) return prev.map(c => c.pid === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        pid: product.id, name: product.name, price: parseFloat(product.price) || 0,
        tax: parseFloat(product.taxRate) || defaultTaxRate, img: product.imageUrl || '',
        uom: product.uomName || 'units', qty: 1, lineDiscount: 0,
        is_packaged: product.isPackagedGood === true
      }];
    });
  }, [defaultTaxRate]);

  const updQty = (pid, d) => setCart(p => p.map(c => c.pid !== pid ? c : { ...c, qty: Math.max(1, c.qty + d) }));
  const delItem = pid => setCart(p => p.filter(c => c.pid !== pid));
  const clearCart = () => { setCart([]); setDiscount({ type: 'amount', value: 0 }); setSelectedCustomers([]); };

  useEffect(() => {
    const h = e => {
      if (phase !== 'pos') return;
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') { setSearch(''); searchRef.current?.blur(); setMobileCart(false); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [phase]);

  const totals = useMemo(() => {
    return calculateOrderTotals(
      cart.map(c => ({ 
        ...c, 
        quantity: c.qty, 
        price: c.price, 
        tax_rate: c.tax, 
        is_packaged: c.is_packaged
      })),
      discount,
      {
        gst_enabled: taxOn,
        default_tax_rate: defaultTaxRate,
        prices_include_tax: pricesInclTax,
        round_off_config: {
          round_off_enabled: roundOn,
          round_off_mode: roundMode,
          round_off_auto_factor: roundFactor
        }
      }
    );
  }, [cart, discount, taxOn, defaultTaxRate, pricesInclTax, roundOn, roundMode, roundFactor]);

  const { 
    total_amount: total, 
    taxable_amount: taxable, 
    total_tax: tax, 
    discount_amount: discountAmt, 
    total_inc_tax: totalBeforeRound, 
    round_off_amount: autoRoundOff, 
    gross_face_total: sub,
    subtotal_base_ex_tax: subEx,
    line_subtotal: grossInc
  } = totals;

  const initiateOrder = (mode) => {
    if (!cart.length) { showToast('Cart is empty', 'error'); return; }
    setPaymentMode(mode);
    setSettledAmount(+(total).toFixed(2));
    setShowPaymentDialog(true);
  };

  const placeOrder = async (mode = 'settle', method = 'cash', roundOff = 0) => {
    setSaving(true);
    try {
      // Use the centralized calculation engine output for perfect UI ↔ Backend parity
      const processedItems = totals.processed_items || [];
      const payload = {
        orderNo: editingOrderNo || `SO-${Date.now().toString().slice(-8)}`,
        orderType: 'SALE',
        orderStatus: mode === 'kitchen' ? 'KITCHEN' : 'COMPLETED',
        paymentStatus: mode === 'credit' ? 'PAID' : (mode === 'kitchen' ? 'PENDING' : 'PAID'), // Simplified logic
        orderSource: 'OFFLINE', fulfillmentType: fulfillmentType || 'TAKEAWAY',
        tableNumber: tableNumber || null, orderDate: orderTime,
        customerId: selectedCustomers[0]?.id || null,
        totalAmount: +totals.total_inc_tax.toFixed(2),
        totalTaxAmount: +totals.total_tax.toFixed(2),
        totalDiscountAmount: +totals.discount_amount.toFixed(2),
        grandTotal: +((mode === 'settle' || mode === 'credit') ? settledAmount : totals.total_amount).toFixed(2),
        description: method !== 'none' ? `Payment: ${method}` : null,
        lines: processedItems.map(pi => {
          const cartItem = cart.find(c => c.pid === pi.pid || c.name === pi.item_name);
          return {
            productId: cartItem?.pid || pi.pid || null,
            quantity: pi.quantity,
            unitPrice: pi.unit_price,
            unitOfMeasure: cartItem?.uom || pi.unitOfMeasure || 'units',
            taxRate: +pi.tax_rate.toFixed(2),
            taxAmount: +pi.tax_amount.toFixed(2),
            discountAmount: +pi.discount_amount.toFixed(2),
            lineTotal: +pi.line_total.toFixed(2)
          };
        }),
      };

      let r;
      if (editingOrderId) {
        r = await api.put(`/api/v1/orders/${editingOrderId}`, payload);
      } else {
        r = await api.post('/api/v1/orders', payload);
      }

      if (r.data.success) {
        showToast(editingOrderId ? 'Order Updated!' : (mode === 'kitchen' ? 'Sent to Kitchen!' : 'Order Placed!'));
        const createdOrder = r.data.data;
        if (createdOrder) {
          setPrintOrder(createdOrder);
          setPrintKind(mode === 'kitchen' ? 'kot' : 'bill');
        }
        newOrder(); 
        setShowPaymentDialog(false);
      }
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const createCustomer = async () => {
    if (!customerName.trim()) return;
    setCustSaving(true);
    try {
      const r = await api.post('/api/v1/purchasing/customers', { name: customerName, phone: customerPhone });
      if (r.data.success) {
        setCustomers(p => [r.data.data, ...p]);
        setSelectedCustomers(p => [...p, r.data.data]);
        setShowNewCustomer(false);
        showToast('Customer created!');
      }
    } catch (e) { showToast('Failed to create customer', 'error'); }
    finally { setCustSaving(false); }
  };

  const createQuickProduct = async () => {
    if (!qpName.trim() || !qpPrice) return;
    setQpSaving(true);
    try {
      const payload = {
        name: qpName,
        price: parseFloat(qpPrice),
        categoryName: qpCat || 'Quick Add',
        productCode: qpCode,
        taxRate: parseFloat(qpTax) || 0,
        isPackagedGood: qpPkg,
        isActive: true
      };
      const r = await api.post('/api/v1/products', payload);
      if (r.data.success) {
        const p = r.data.data;
        setProducts(prev => [p, ...prev]);
        setCart(prev => [{ 
          pid: p.id, name: p.name, price: p.price, qty: 1, 
          tax: p.taxRate || 0, uom: p.uomName || 'units',
          is_packaged: p.isPackagedGood === true
        }, ...prev]);
        setShowQuickProduct(false);
        showToast('Product added to menu & cart!');
      }
    } catch (e) { showToast('Failed to create product', 'error'); }
    finally { setQpSaving(false); }
  };

  const pickTable = async t => { 
    if (opMode === 'tables') {
      setSelectedTable(t);
      setShowTableActions(true);
      setActiveOrderDetails(null);
      const activeOrder = allOrders.find(o => o.tableNumber === t.tableNumber && o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED');
      if (activeOrder) {
        setDetailsLoading(true);
        try {
          const r = await api.get(`/api/v1/orders/${activeOrder.id}`);
          setActiveOrderDetails(r.data.data);
        } catch (e) { console.error(e); }
        finally { setDetailsLoading(false); }
      }
    } else {
      setTableNumber(t.tableNumber); 
      setPhase('pos'); 
    }
  };
  const newOrder = () => { 
    clearCart(); 
    setTableNumber(''); 
    setEditingOrderId(null);
    setEditingOrderNo(null);
    setPhase(tableOn ? 'table' : 'pos'); 
  };

  const toggleFS = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFS(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFS(false);
      }
    }
  };



  const catNames = useMemo(() => ['ALL', ...new Set(products.map(p => p.categoryName).filter(Boolean))], [products]);

  if (loading) return (
    <DashboardLayout title="Sales" showBack>
      <div className="sl"><div className="sp"/><span>Loading POS…</span>
      <style jsx>{`.sl{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;color:#94a3b8;font-weight:700}.sp{width:38px;height:38px;border:4px solid #f1f5f9;border-top-color:#f97316;border-radius:50%;animation:sp .7s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title="Sales" showBack noSidebar={true}>
      <div className="pos-container" style={{ '--theme': themeColor, '--rgb': themeRGB }}>
        <header className="pos-hdr">
          <div className="pos-hdr-l">
            <button className="ctx-bk" onClick={() => router.back()} title="Go Back"><FaArrowLeft/></button>
            
            {opMode === 'pos' && (
              <div className="pos-hdr-controls">
                <div className="hdr-context-group">
                  <div className="pos-modes single">
                    {(() => {
                      const f = FULFILLMENT.find(x => x.key === fulfillmentType) || FULFILLMENT[0];
                      return (
                        <button className="mode-btn active" onClick={() => setPhase('table')} style={{ '--theme': f.color }}>
                          <span className="mode-ic">{f.icon}</span>
                          <span className="mode-lb">{f.label} {tableNumber && `(#${tableNumber})`}</span>
                        </button>
                      );
                    })()}
                  </div>
                  
                  {editingOrderId && (
                    <div className="hdr-edit-badge">
                      <FaEdit className="eb-ic"/>
                      <span className="mdl-hdr-sub">{editingOrderNo} • {editingOrderData?.fulfillmentType}</span>
                      <button className="eb-x" onClick={newOrder}><FaTimes/></button>
                    </div>
                  )}

                  <div className="hdr-divider"/>

                  {customerOn && (
                    <div className="hdr-cust-zone" ref={custZoneRef}>
                      <div className="sb-wrap hdr">
                        <FaUsers className="sb-ic"/>
                        <input className="sb-in" placeholder={selectedCustomers.length ? "" : "Search Customer…"} 
                          value={customerSearch} 
                          onChange={e=>{setCustomerSearch(e.target.value); setShowSuggestions(true);}} 
                          onFocus={()=>setShowSuggestions(true)}
                        />
                      </div>
                      
                      <div className="cust-chips">
                        {selectedCustomers.map(c => (
                          <div key={c.id} className="cust-chip" style={{'--theme':themeColor}}>
                            <span className="chip-nm">{c.name}</span>
                            <button className="chip-x" onClick={() => setSelectedCustomers(p => p.filter(x => x.id !== c.id))}><FaTimes/></button>
                          </div>
                        ))}
                      </div>

                      {showSuggestions && (
                        <div className="hdr-cust-suggestions">
                          {(() => {
                            const filtered = customers.filter(c => 
                              (c.name || '').toLowerCase().includes((customerSearch || '').toLowerCase()) || 
                              (c.phone || '').includes(customerSearch)
                            ).filter(c => !selectedCustomers.some(s => s.id === c.id)).slice(0, 6);
                            
                            if (filtered.length === 0 && customerSearch) {
                              return <div className="sugg-none">No customers found</div>;
                            }
                            
                            return filtered.map(c => (
                              <div key={c.id} className="sugg-item" onClick={() => {
                                setSelectedCustomers(p => [...p, c]);
                                setCustomerSearch('');
                                setShowSuggestions(false);
                              }}>
                                <div className="sugg-av">{c.name ? c.name[0] : '?'}</div>
                                <div className="sugg-info">
                                  <div className="sugg-nm">{c.name}</div>
                                  <div className="sugg-ph">{c.phone}</div>
                                </div>
                              </div>
                            ));
                          })()}
                          <div className="sugg-ft" onClick={() => { setCustomerName(customerSearch); setShowNewCustomer(true); setShowSuggestions(false); }}>
                            + Add New Customer
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pos-hdr-c">
            <div className="op-switcher">
              {[
                { id: 'pos',     label: 'POS',     icon: <FaCashRegister/> },
                { id: 'kitchen', label: 'Kitchen', icon: <FaFire/> },
                { id: 'tables',  label: 'Tables',  icon: <FaUtensils/> },
                { id: 'history', label: 'History', icon: <FaReceipt/> }
              ].map(m => (
                <button key={m.id} className={`op-btn ${opMode === m.id ? 'on' : ''}`} onClick={() => setOpMode(m.id)}>
                  {m.icon} <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pos-hdr-r">
            {opMode === 'pos' && (kitchenOn || creditOn) && (
              <div className="pos-modes om-toggle">
                {kitchenOn && (
                  <button className={`mode-btn ${orderMode==='kitchen'?'active':''}`} style={{'--theme':'#f97316'}} onClick={()=>setOrderMode('kitchen')}>
                    <span className="mode-ic"><FaFire/></span><span className="mode-lb mobile-hide">Kitchen</span>
                  </button>
                )}
                <button className={`mode-btn ${orderMode==='settle'?'active':''}`} style={{'--theme':'#16a34a'}} onClick={()=>setOrderMode('settle')}>
                  <span className="mode-ic"><FaWallet/></span><span className="mode-lb mobile-hide">Settle</span>
                </button>
                {creditOn && (
                  <button className={`mode-btn ${orderMode==='credit'?'active':''}`} style={{'--theme':'#6366f1'}} onClick={()=>setOrderMode('credit')}>
                    <span className="mode-ic"><FaCreditCard/></span><span className="mode-lb mobile-hide">Credit</span>
                  </button>
                )}
              </div>
            )}
            <button className="ctx-bk fs-btn" onClick={toggleFS} title={isFS ? "Exit Fullscreen" : "Enter Fullscreen"}>
              {isFS ? <FaCompress/> : <FaExpand/>}
            </button>
            <button className="ctx-bk rst" onClick={newOrder} title="Reset POS"><FaRedo/></button>
          </div>
        </header>

        <div className={"pos-main" + (!listingOn && opMode === 'pos' ? ' no-listing' : '') + (opMode !== 'pos' ? ' full' : '')}>
          {opMode === 'pos' && (
            <>
              <section className="catalog">
                <div className="pos-search-zone" ref={prodZoneRef}>
                  <div className="ps-bar-wrapper">
                    <FaSearch className="ps-ic"/>
                    <input ref={searchRef} className="ps-in" 
                      placeholder={listingOn ? "Search Products…" : "Search & Select Products…"} 
                      value={search} 
                      onChange={e=>{setSearch(e.target.value); if(!listingOn) setShowProdSuggestions(true);}}
                      onFocus={()=>{if(!listingOn) setShowProdSuggestions(true);}}
                    />
                    {search && <button className="ps-clear" onClick={()=>setSearch('')}><FaTimes/></button>}
                    <button className="ps-add-btn" title="Quick Add Product" onClick={()=>setShowQuickProduct(true)}><FaPlus/></button>
                  </div>
                  
                  {!listingOn && showProdSuggestions && (
                    <div className="hdr-cust-suggestions">
                      {(() => {
                        const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
                        if (filtered.length === 0) return <div className="sugg-none">No products found</div>;
                        return filtered.map(p => (
                          <div key={p.id} className="sugg-item" onClick={() => {
                            const existing = cart.find(c => c.pid === p.id);
                            if (existing) updQty(p.id, 1);
                            else setCart(prev => [{ 
                              pid: p.id, name: p.name, price: p.price, qty: 1,
                              tax: p.taxRate || defaultTaxRate, uom: p.uomName || 'units',
                              is_packaged: p.isPackagedGood === true
                            }, ...prev]);
                            setSearch('');
                            setShowProdSuggestions(false);
                          }}>
                            <div className="sugg-info">
                              <div className="sugg-nm">{p.name}</div>
                            </div>
                            <div className="sugg-ph" style={{color:'var(--theme)',fontWeight:'800'}}>{sym}{p.price.toFixed(2)}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                {listingOn && (
                  <div className="cats-scroll">
                    {catNames.map(c=>(
                      <div key={c} className={`cat-orb ${activeCat===c?'on':''}`} onClick={()=>setActiveCat(c)}>
                        <span className="cat-orb-t">{c==='ALL'?'All':c}</span>
                      </div>
                    ))}
                  </div>
                )}

                {listingOn && (
                <div className="prod-grid">
                  {products
                    .filter(p => (activeCat==='ALL' || p.categoryName===activeCat) && 
                      (p.name.toLowerCase().includes(search.toLowerCase()) || p.productCode?.toLowerCase().includes(search.toLowerCase())))
                    .map(p => (
                      <div key={p.id} className="pc-card">
                        {imagesOn && p.imageUrl && <div className="pc-img-v" style={{backgroundImage:`url(${p.imageUrl})`}}/>}
                        <div className="pc-body">
                          <div className="pc-nm">{p.name}</div>
                          <div className="pc-pr-row">
                            <div className="pc-pr">{sym}{parseFloat(p.price).toFixed(2)}</div>
                            <button className="pc-add" onClick={()=>addToCart(p)}><FaPlus/></button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                )}
              </section>

              <aside className="cart-panel">
                <div className="cp-hd">
                  <div className="ts-zone">
                    <PremiumDateTimePicker 
                      value={orderTime} 
                      onChange={(val) => setOrderTime(val)} 
                      themeColor={themeColor}
                    />
                  </div>
                </div>
                <div className="cp-body">
                    {(totals.processed_items || cart).map(item => (
                      <div key={item.pid} className="ci-card">
                        {imagesOn && item.img && <div className="ci-img" style={{backgroundImage:`url(${item.img})`}}/>}
                        <div className="ci-info">
                          <div className="ci-nm">{item.name}</div>
                          <div className="ci-pr-row">
                            <div className="ci-pr">
                              {item.lineDiscount > 0 ? (
                                <>
                                  <span style={{textDecoration: 'line-through', color: '#94a3b8', fontSize: '10.5px', marginRight: '6px', fontWeight: 600}}>
                                    {sym}{(item.price * item.qty).toFixed(2)}
                                  </span>
                                  {sym}{(item.price * item.qty - item.lineDiscount).toFixed(2)}
                                </>
                              ) : (
                                <>{sym}{(item.price * item.qty).toFixed(2)}</>
                              )}
                            </div>
                            <div className="ci-qty">
                              <button className="ci-q-btn" onClick={()=>updQty(item.pid,-1)}><FaMinus/></button>
                              <span className="ci-q-val">{item.qty}</span>
                              <button className="ci-q-btn" onClick={()=>updQty(item.pid,1)}><FaPlus/></button>
                            </div>
                          </div>
                          {taxOn && item.tax_amount > 0 && (
                            <div style={{fontSize:'10px', color:'#64748b', marginTop:'4px', display:'flex', justifyContent:'space-between'}}>
                              <span>{taxSplitOn ? `C/S ${taxLabel}` : taxLabel} ({item.tax_rate}%)</span>
                              <span>{pricesInclTax ? '(incl.) ' : '+'}{sym}{item.tax_amount.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                <div className="cp-ft">
                  <div className="cp-summary">
                    <div className="cp-row"><span>Sub Total</span><span>{sym}{sub.toFixed(2)}</span></div>
                    {discountOn && orderMode !== 'kitchen' && (
                      discountAmt > 0 ? (
                        <>
                          <div className="cp-row" style={{color:'#ef4444'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                              <span>Discount (-)</span>
                              <button className="disc-edit-link" onClick={()=>{setDiscountTab('order');setShowDiscountModal(true);}}>Edit</button>
                            </div>
                            <span>-{sym}{discountAmt.toFixed(2)}</span>
                          </div>
                          <div className="cp-row"><span>Discounted Total</span><span>{sym}{taxable.toFixed(2)}</span></div>
                        </>
                      ) : (
                        <div className="cp-row">
                          <button className="disc-add-link" onClick={()=>{setDiscountTab('order');setShowDiscountModal(true);}}>+ Add Discount</button>
                        </div>
                      )
                    )}
                    {taxOn && tax > 0.01 && !taxSplitOn && <div className="cp-row"><span>{taxLabel} Total</span><span>{sym}{tax.toFixed(2)}</span></div>}
                    {taxOn && tax > 0.01 && taxSplitOn && (
                      <>
                        <div className="cp-row"><span>C{taxLabel} ({pricesInclTax ? 'incl' : '+'})</span><span>{sym}{(tax/2).toFixed(2)}</span></div>
                        <div className="cp-row"><span>S{taxLabel} ({pricesInclTax ? 'incl' : '+'})</span><span>{sym}{(tax/2).toFixed(2)}</span></div>
                      </>
                    )}
                    {roundOn && Math.abs(autoRoundOff) > 0.001 && (
                      <div className="cp-row" style={{color: autoRoundOff > 0 ? '#16a34a' : '#ef4444', fontSize:'12px'}}>
                        <span>Round Off</span>
                        <span>{autoRoundOff > 0 ? '+' : ''}{sym}{autoRoundOff.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="cp-row tot"><span>Total</span><span>{sym}{total.toFixed(2)}</span></div>
                  </div>
                  <button className="cp-main-act" disabled={!cart.length||saving} onClick={()=>{
                    if(orderMode==='kitchen') placeOrder('kitchen','none',0); 
                    else if(orderMode==='credit') { setPaymentMode('credit'); setShowPaymentDialog(true); }
                    else { setPaymentMode('cash'); setShowPaymentDialog(true); }
                  }}>
                    {saving?'Processing…':(orderMode==='kitchen'?'Send to Kitchen':orderMode==='credit'?'Credit Sale':'Place Order')}
                  </button>
                </div>
              </aside>
            </>
          )}

          {(opMode === 'kitchen' || opMode === 'tables') && (
            <div className="op-view">
              <div className="ov-header">
                {opMode === 'kitchen' ? (
                  <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                    <div className="kitchen-filters">
                      {['TAKEAWAY', 'DELIVERY'].map(f => (
                        <button 
                          key={f} 
                          className={`k-filter-btn ${kitchenFilter === f ? 'on' : ''}`}
                          onClick={() => setKitchenFilter(f)}
                        >
                          {f.charAt(0) + f.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div style={{display:'flex',gap:'8px',alignItems:'center',width:opMode==='tables'?'100%':'auto',justifyContent:opMode==='tables'?'flex-end':'flex-start', marginBottom:opMode==='tables'?'-10px':'0'}}>
                  {ordersLoading && <span className="ov-loading">Refreshing…</span>}
                  <button className="ov-refresh" onClick={fetchOrders}><FaRedo/></button>
                </div>
              </div>
              
              {opMode === 'kitchen' ? (
                <div className="ov-grid">
                  {allOrders
                    .filter(o => o.fulfillmentType !== 'DINE_IN')
                    .filter(o => kitchenFilter === 'ALL' || o.fulfillmentType === kitchenFilter)
                    .filter(o => o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED')
                    .map(o => {
                      const isExpanded = expandedOrderId === o.id;
                      return (
                        <div key={o.id} className={`ov-card ${isExpanded ? 'expanded' : ''}`} 
                             style={{borderLeft: `4px solid ${o.fulfillmentType === 'DELIVERY' ? '#0ea5e9' : '#16a34a'}`}}
                             onClick={async () => {
                               if (isExpanded) {
                                 setExpandedOrderId(null);
                               } else {
                                 setExpandedOrderId(o.id);
                                 setDetailsLoading(true);
                                 try {
                                   const r = await api.get(`/api/v1/orders/${o.id}`);
                                   setActiveOrderDetails(r.data.data);
                                 } catch (e) {
                                   showToast('Err', 'error');
                                 } finally {
                                   setDetailsLoading(false);
                                 }
                               }
                             }}>
                          <div className="ov-card-hd">
                            <div style={{display:'flex', flexDirection:'column'}}>
                              <div className="ov-id">#{o.orderNo.slice(-6)}</div>
                              <div style={{fontSize:'10px', fontWeight:700, color:'#94a3b8'}}>{o.fulfillmentType}</div>
                            </div>
                            <div className={`ov-st ${o.orderStatus.toLowerCase()}`}>{o.orderStatus}</div>
                          </div>
                          
                          <div className="ov-details" style={{padding:'8px 0'}}>
                            <div className="ov-time" style={{display:'flex', alignItems:'center', gap:'6px'}}>
                              <FaClock style={{fontSize:'10px', opacity:0.5}}/>
                              <span>{new Date(o.orderDate).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                            {o.customerName && (
                              <div style={{fontSize:'11px', fontWeight:700, color:'#475569', marginTop:'4px'}}>
                                <FaUser style={{fontSize:'9px', marginRight:'4px', opacity:0.5}}/>
                                {o.customerName}
                              </div>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="ov-expand-content" onClick={e => e.stopPropagation()}>
                              <div className="ov-items-list" style={{maxHeight:'150px', overflowY:'auto', borderTop:'1px solid #f1f5f9', paddingTop:'8px', marginTop:'4px'}}>
                                {detailsLoading ? (
                                  <div style={{fontSize:'10px', color:'#94a3b8', textAlign:'center', padding:'10px'}}>Loading Items...</div>
                                ) : activeOrderDetails?.id === o.id ? (
                                  activeOrderDetails.lines?.map((l, idx) => (
                                    <div key={idx} style={{display:'flex', justifyContent:'space-between', fontSize:'11px', marginBottom:'4px'}}>
                                      <span style={{fontWeight:600}}>{l.productName} <span style={{color:'var(--theme)'}}>x{l.quantity}</span></span>
                                    </div>
                                  ))
                                ) : null}
                              </div>

                              <div className="ov-actions" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginTop:'12px', borderTop:'1px solid #f1f5f9', paddingTop:'12px'}}>
                                <button className="vm-pill micro lite edit" onClick={() => loadOrderForEdit(o.id)}>Edit</button>
                                                 <button className="vm-pill micro lite bill" onClick={async () => {
                                  try {
                                    showToast('Preparing Bill...');
                                    const { data: { data: fullOrder } } = await api.get(`/api/v1/orders/${o.id}`);
                                    setPrintOrder(fullOrder);
                                    setPrintKind('bill');
                                    showToast('Sent to Printer');
                                  } catch (e) {
                                    console.error('Print Error:', e);
                                    showToast('Print failed', 'error');
                                  }
                                }}>Print</button>
                                
                                <button className="vm-pill micro lite complete" style={{gridColumn:'span 2'}} onClick={async () => {
                                  if(!confirm('Complete Order?')) return;
                                  try { 
                                    await api.patch(`/api/v1/orders/${o.id}/status`, null, { params: { status: 'COMPLETED' } }); 
                                    showToast('Done'); 
                                    fetchOrders(); 
                                  } catch (e) { showToast('Err', 'error'); }
                                }}>Complete Transaction</button>
                                
                                <button className="vm-pill micro lite cancel" style={{gridColumn:'span 2'}} onClick={async () => {
                                  if(!confirm('Cancel Order?')) return;
                                  try { 
                                    await api.patch(`/api/v1/orders/${o.id}/status`, null, { params: { status: 'CANCELLED' } }); 
                                    showToast('Cancelled'); 
                                    fetchOrders(); 
                                  } catch (e) { showToast('Err', 'error'); }
                                }}>Cancel Order</button>
                              </div>
                            </div>
                          )}

                          {!isExpanded && (
                            <div style={{display:'flex', justifyContent:'flex-end', alignItems:'center', borderTop:'1px solid #f8fafc', paddingTop:'8px'}}>
                               <div style={{fontSize:'10px', fontWeight:800, color:'#94a3b8'}}>{o.totalItems || 0} Items</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="vm-graph" style={{padding:0}}>
                  {(() => {
                    const grouped = tables.reduce((acc, t) => {
                      const f = t.floor || 'Main';
                      const s = t.section || 'General';
                      if (!acc[f]) acc[f] = {};
                      if (!acc[f][s]) acc[f][s] = [];
                      acc[f][s].push(t);
                      return acc;
                    }, {});

                    return Object.entries(grouped).map(([floor, sections]) => (
                      <div key={floor} className="vm-floor-group" style={{marginBottom:'12px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px', padding:'0 2px'}}>
                          <div style={{width:'2px', height:'12px', background:'var(--theme)', borderRadius:'4px', opacity:0.6}}/>
                          <h4 style={{fontSize:'10px', fontWeight:900, textTransform:'uppercase', letterSpacing:'0.05em', color:'#64748b', margin:0}}>{floor}</h4>
                        </div>
                        
                        {Object.entries(sections).map(([section, sectionTables]) => (
                          <div key={section} className="vm-section-group" style={{marginBottom:'8px', paddingLeft:'8px'}}>
                            {section !== 'General' && <div style={{fontSize:'8px', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom: '4px'}}>{section}</div>}
                            <div className="vm-grid">
                              {sectionTables.map(t => {
                                const s = (t.status||'').toUpperCase();
                                const cls = s==='AVAILABLE'?'av':s==='OCCUPIED'?'occ':s==='BILLED'?'bld':s==='RESERVED'?'res':s==='CLEANING'?'cln':s==='MAINTENANCE'?'mnt':'av';
                                const activeOrder = allOrders.find(o => o.tableNumber === t.tableNumber && o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED');
                                
                                return (
                                  <button key={t.id} className={`vm-node ${cls} ${t.shape==='round'?'round':''}`} onClick={()=>pickTable(t)}>
                                    <div className="vm-node-c">
                                      <span className="vm-node-n">{t.tableNumber}</span>
                                      {activeOrder ? (
                                        <span className="vm-node-s" style={{fontSize:'10px',fontWeight:700,color:'var(--theme)'}}>{sym}{activeOrder.grandTotal.toFixed(0)}</span>
                                      ) : (
                                        <span className="vm-node-s"><FaUsers/> {t.seatingCapacity||4}</span>
                                      )}
                                    </div>
                                    {s==='OCCUPIED' && <div className="vm-pulse"/>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                  
                  {opMode === 'tables' && (
                    <div className="vm-floating-leg">
                      <div className="vm-leg-i"><span className="vm-dot av"/>Available</div>
                      <div className="vm-leg-i"><span className="vm-dot occ"/>Occupied</div>
                      <div className="vm-leg-i"><span className="vm-dot bld"/>Billed</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {opMode === 'history' && (
            <div className="op-view">
              <ReportTable
                accentColor={themeColor}
                columns={[
                  { 
                    key: 'orderNo', 
                    label: 'Order #',
                    render: (o) => (
                      <div style={{display:'flex', flexDirection:'column'}}>
                        <span style={{fontFamily:'monospace', fontWeight:800, color:themeColor, fontSize:'13px'}}>{o.orderNo}</span>
                        <span style={{fontSize:'9px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase'}}>{o.fulfillmentType}</span>
                      </div>
                    )
                  },
                  {
                    key: 'invoiceNo',
                    label: 'Invoice No',
                    render: (o) => <span style={{fontWeight:700, color:'#475569'}}>{o.invoiceNo || '-'}</span>
                  },
                  {
                    key: 'paymentNo',
                    label: 'Payment No',
                    render: (o) => <span style={{fontWeight:700, color:'#475569'}}>{o.paymentNo || '-'}</span>
                  },
                  { 
                    key: 'orderDate', 
                    label: 'Date & Time',
                    render: (o) => (
                      <div style={{display:'flex', flexDirection:'column'}}>
                        <span style={{fontWeight:700}}>{new Date(o.orderDate).toLocaleDateString()}</span>
                        <span style={{fontSize:'10px', opacity:0.6}}>{new Date(o.orderDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                      </div>
                    )
                  },
                  { 
                    key: 'grandTotal', 
                    label: 'Total', 
                    align: 'right',
                    render: (o) => <span style={{fontWeight:900, color:'#0f172a', fontSize:'14px'}}>{sym}{o.grandTotal.toFixed(2)}</span>
                  },
                  {
                    key: 'actions',
                    label: '',
                    align: 'right',
                    render: (o) => {
                      const canManage = userRole?.includes('ADMIN') || userRole?.includes('MANAGER');
                      return (
                        <div style={{display:'flex', gap:'6px', justifyContent:'flex-end'}}>
                          {canManage && (
                            <>
                              <button className="vm-pill micro lite edit" style={{padding:'6px 10px', fontSize:'9px'}} onClick={() => { console.log('Edit Clicked for ID:', o.id); loadOrderForEdit(o.id); }}>
                                Edit
                              </button>
                              <button className="vm-pill micro lite cancel" style={{padding:'6px 10px', fontSize:'9px'}} onClick={async () => {
                                if(!confirm('Are you sure you want to CANCEL this order? This will void the transaction.')) return;
                                try {
                                  await api.patch(`/api/v1/orders/${o.id}/status`, null, { params: { status: 'CANCELLED' } });
                                  showToast('Order Cancelled');
                                  fetchOrders();
                                } catch (e) { showToast('Cancel Failed', 'error'); }
                              }}>Cancel</button>
                            </>
                          )}
                          <button className="vm-pill micro lite bill" style={{padding:'6px 10px', fontSize:'9px', minWidth:'50px'}} onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              showToast('Re-printing...');
                              const { data: { data: fullOrder } } = await api.get(`/api/v1/orders/${o.id}`);
                              setPrintOrder(fullOrder);
                              setPrintKind('bill');
                              showToast('Sent to Printer');
                            } catch (err) { 
                              console.error('Reprint Error:', err);
                              showToast('Print Error', 'error'); 
                            }
                          }}>Print</button>
                        </div>
                      );
                    }
                  }
                ]}
                data={allOrders.filter(o => o.orderStatus === 'COMPLETED' || o.orderStatus === 'PAID')}
                emptyTitle="No completed orders"
                emptyText="Once orders are finalized, they will appear here in your history."
              />
            </div>
          )}
        </div>

        {phase==='table' && (
          <div className="vm-overlay">
            <div className="vm-modal">
              <div className="vm-body">
                <div className="vm-top-strip">
                  <div className="vm-modes-row">
                    {FULFILLMENT.map(f=>(
                      <button key={f.key} className={`vm-m-btn ${fulfillmentType===f.key?'on':''}`} style={{'--m-clr':f.color}} onClick={()=>{setFulfillmentType(f.key); if(f.key!=='DINE_IN'){setTableNumber('');setPhase('pos');}}}>
                        <span className="vm-m-ic">{f.icon}</span>{f.label}
                      </button>
                    ))}
                  </div>
                  <button className="vm-top-x" onClick={()=>setPhase('pos')}><FaTimes/></button>
                </div>

                <div className="vm-ctrl-strip">
                  <div className="vm-f-scroller">
                    {['ALL',...new Set(tables.map(t=>t.floor).filter(Boolean))].map(f=>(
                      <button key={f} className={`vm-f-btn ${activeFloor===f?'on':''}`} onClick={()=>setActiveFloor(f)}>{f==='ALL'?'All Zones':f}</button>
                    ))}
                  </div>
                  <div className="vm-leg-scroller">
                    <div className="vm-leg-i"><span className="vm-dot av"/>Available</div>
                    <div className="vm-leg-i"><span className="vm-dot occ"/>Occupied</div>
                    <div className="vm-leg-i"><span className="vm-dot bld"/>Billed</div>
                    <div className="vm-leg-i"><span className="vm-dot res"/>Reserved</div>
                    <div className="vm-leg-i"><span className="vm-dot cln"/>Cleaning</div>
                    <div className="vm-leg-i"><span className="vm-dot mnt"/>Service</div>
                  </div>
                </div>

                <div className="vm-graph">
                  <div className="vm-grid">
                    {tables.filter(t=>activeFloor==='ALL'||t.floor===activeFloor).map(t=>{
                      const s = (t.status||'').toUpperCase();
                      const cls = s==='AVAILABLE'?'av':s==='OCCUPIED'?'occ':s==='BILLED'?'bld':s==='RESERVED'?'res':s==='CLEANING'?'cln':s==='MAINTENANCE'?'mnt':'av';
                      return (
                        <button key={t.id} className={`vm-node ${cls} ${t.shape==='round'?'round':''}`} onClick={()=>pickTable(t)}>
                          <div className="vm-node-c">
                            <span className="vm-node-n">{t.tableNumber}</span>
                            <span className="vm-node-s"><FaUsers/> {t.seatingCapacity||4}</span>
                          </div>
                          {s==='OCCUPIED' && <div className="vm-pulse"/>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="vm-ft"><button className="vm-skip" onClick={()=>{setTableNumber('');setPhase('pos');}}>Skip →</button></div>
            </div>
          </div>
        )}

      {showPaymentDialog && (
        <div className="mdl-ov" onClick={()=>setShowPaymentDialog(false)}>
          <div className="mdl-box" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
            <div className="mdl-hdr theme-bg">
              <div className="mdl-hdr-info">
                <h3 className="mdl-hdr-t">{paymentMode==='credit'?'Confirm Credit Sale':'Payment Confirmation'}</h3>
                <span className="mdl-hdr-sub">SELECT PAYMENT METHOD & FINALIZE</span>
              </div>
              <button className="mdl-hdr-x" onClick={()=>setShowPaymentDialog(false)}><FaTimes/></button>
            </div>
            <div className="mdl-body">
              <div style={{padding:'12px 20px', background:'#f8fafc', borderRadius:'10px', margin:'0 0 16px 0', display:'flex', flexDirection:'column', gap:'6px'}}>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b'}}><span>Gross Total (Incl. Tax)</span><span>{sym}{grossInc.toFixed(2)}</span></div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b'}}><span>Subtotal (Ex-Tax)</span><span>{sym}{subEx.toFixed(2)}</span></div>
                {discountAmt > 0 && <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#ef4444'}}><span>Discount</span><span>-{sym}{discountAmt.toFixed(2)}</span></div>}
                <div style={{height: '1px', background: '#e2e8f0', margin: '4px 0'}}></div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b'}}><span>Taxable Value</span><span>{sym}{taxable.toFixed(2)}</span></div>
                {taxOn && tax > 0.01 && !taxSplitOn && <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b'}}><span>{taxLabel} (+)</span><span>{sym}{tax.toFixed(2)}</span></div>}
                {taxOn && tax > 0.01 && taxSplitOn && (
                  <>
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b'}}><span>C{taxLabel} (+)</span><span>{sym}{(tax/2).toFixed(2)}</span></div>
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b'}}><span>S{taxLabel} (+)</span><span>{sym}{(tax/2).toFixed(2)}</span></div>
                  </>
                )}
                {roundOn && Math.abs(autoRoundOff) > 0.001 && <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color: autoRoundOff > 0 ? '#16a34a' : '#ef4444'}}><span>Round Off</span><span>{autoRoundOff > 0 ? '+' : ''}{sym}{autoRoundOff.toFixed(2)}</span></div>}
              </div>
              <div className="mdl-settled"><span>Settled Total</span><b className="theme-text">{sym}{settledAmount.toFixed(2)}</b></div>
              {paymentMode!=='credit' && (
                <div className="pay-grid">
                  {[{k:'cash',l:'💵 Cash'},{k:'online',l:'💳 Online'},{k:'mixed',l:'🔀 Mixed'}].map(pm=>(
                    <button key={pm.k} className={`pay-opt ${paymentMethod===pm.k?'on':''}`} style={{'--pc':'var(--theme)'}} onClick={()=>setPaymentMethod(pm.k)}><span>{pm.l}</span></button>
                  ))}
                </div>
              )}
              <div className="mdl-acts-row">
                <button className="mdl-btn-discard" onClick={()=>setShowPaymentDialog(false)}>Discard</button>
                <button className="mdl-btn-confirm theme-bg" disabled={saving} onClick={()=>placeOrder(paymentMode,paymentMethod,settledAmount-total)}>{saving?'Processing…':'Confirm & Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDiscountModal && (
        <div className="mdl-ov" onClick={()=>setShowDiscountModal(false)}>
          <div className="mdl-box" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}>
            <div className="mdl-hdr theme-bg">
              <div className="mdl-hdr-info">
                <h3 className="mdl-hdr-t">Discounts</h3>
                <span className="mdl-hdr-sub">LINE-WISE & ORDER-LEVEL</span>
              </div>
              <button className="mdl-hdr-x" onClick={()=>setShowDiscountModal(false)}><FaTimes/></button>
            </div>
            <div className="mdl-body" style={{padding:0}}>
              {/* Tabs */}
              <div className="disc-tabs">
                <button className={`disc-tab ${discountTab==='line'?'on':''}`} onClick={()=>setDiscountTab('line')}>Line-wise</button>
                <button className={`disc-tab ${discountTab==='order'?'on':''}`} onClick={()=>setDiscountTab('order')}>Bill Discount</button>
              </div>

              {discountTab === 'line' && (
                <div className="disc-line-list">
                  {cart.length === 0 && <div style={{padding:'24px',textAlign:'center',color:'#94a3b8',fontSize:'13px',fontWeight:600}}>Cart is empty</div>}
                  {cart.map(item => {
                    const lineDiscVal = item.lineDiscount || 0;
                    return (
                      <div key={item.pid} className="disc-line-item">
                        <div className="disc-line-info">
                          <div className="disc-line-nm">{item.name}</div>
                          <div className="disc-line-meta">{sym}{item.price} × {item.qty} = {sym}{(item.price*item.qty).toFixed(2)}</div>
                        </div>
                        <div className="disc-line-input-wrap">
                          <span className="disc-line-sym">{sym}</span>
                          <input
                            type="number"
                            className="disc-line-input"
                            placeholder="0"
                            value={lineDiscVal || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setCart(prev => prev.map(c => c.pid === item.pid ? { ...c, lineDiscount: val, discount: { type: 'amount', value: val } } : c));
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {discountTab === 'order' && (
                <div style={{padding:'24px',display:'flex',flexDirection:'column',gap:'16px'}}>
                  <div className="disc-type-row">
                    <button className={`dt-chip ${discount.type==='amount'?'on':''}`} onClick={()=>setDiscount(d=>({...d,type:'amount'}))}>{sym} Amount</button>
                    <button className={`dt-chip ${discount.type==='percent'?'on':''}`} onClick={()=>setDiscount(d=>({...d,type:'percent'}))}>% Percent</button>
                  </div>
                  <div className="mdl-field">
                    <label>🏷️ Discount Value</label>
                    <input type="number" placeholder="0.00" value={discount.value || ''} onChange={e=>setDiscount(d=>({...d,value:parseFloat(e.target.value)||0}))}/>
                  </div>

                </div>
              )}

              <div style={{padding:'12px 20px',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'center'}}>
                <button className="mdl-btn-confirm" style={{width:'100%',maxWidth:'240px'}} onClick={()=>setShowDiscountModal(false)}>Apply & Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomerPicker && (
        <div className="mdl-ov" onClick={()=>setShowCustomerPicker(false)}>
          <div className="mdl-box" onClick={e=>e.stopPropagation()} style={{maxWidth:450}}>
            <div className="mdl-accent" style={{background:'var(--theme)'}}/>
            <button className="mdl-x" onClick={()=>setShowCustomerPicker(false)}><FaTimes/></button>
            <div className="mdl-inner">
              <h3 className="mdl-t ctr">Select Customer</h3>
              <div className="mdl-field"><input placeholder="Search customer…" value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)}/></div>
              <div className="cust-list">
                {customers.filter(c=>c.name?.toLowerCase().includes(customerSearch.toLowerCase())).map(c=>(
                  <button key={c.id} className="cust-item" onClick={()=>{setSelectedCustomerId(c.id);setShowCustomerPicker(false);}}>
                    <div className="cust-av">{c.name[0]}</div>
                    <div className="cust-info"><div className="cust-nm">{c.name}</div><div className="cust-ph">{c.phone}</div></div>
                  </button>
                ))}
              </div>
              <button className="mdl-confirm" style={{width:'100%',background:'var(--theme)'}} onClick={()=>{setShowCustomerPicker(false);setShowNewCustomer(true);}}>+ Create New</button>
            </div>
          </div>
        </div>
      )}

      {showNewCustomer && (
        <div className="mdl-ov" onClick={()=>setShowNewCustomer(false)}>
          <div className="mdl-box" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
            <div className="mdl-hdr theme-bg">
              <div className="mdl-hdr-info">
                <h3 className="mdl-hdr-t">New Customer</h3>
                <span className="mdl-hdr-sub">ADD TO DATABASE INSTANTLY</span>
              </div>
              <button className="mdl-hdr-x" onClick={()=>setShowNewCustomer(false)}><FaTimes/></button>
            </div>
            <div className="mdl-body">
              <div className="mdl-field"><label>👤 Full Name</label><input placeholder="e.g. John Doe" value={customerName} onChange={e=>setCustomerName(e.target.value)}/></div>
              <div className="mdl-field"><label>📞 Phone Number</label><input placeholder="e.g. 9876543210" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/></div>
              <div className="mdl-acts-row">
                <button className="mdl-btn-discard" onClick={()=>setShowNewCustomer(false)}>Discard</button>
                <button className="mdl-btn-confirm theme-bg" disabled={custSaving} onClick={createCustomer}>{custSaving?'Saving…':'Confirm & Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuickProduct && (
        <div className="mdl-ov" onClick={()=>setShowQuickProduct(false)}>
          <div className="mdl-box" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
            <div className="mdl-hdr theme-bg">
              <div className="mdl-hdr-info">
                <h3 className="mdl-hdr-t">Quick Add Item</h3>
                <span className="mdl-hdr-sub">ADD TO MENU & CART INSTANTLY</span>
              </div>
              <button className="mdl-hdr-x" onClick={()=>setShowQuickProduct(false)}><FaTimes/></button>
            </div>
            <div className="mdl-body">
              <div className="mdl-field"><label>🍽️ ITEM NAME</label><input placeholder="e.g. Special Masala Tea" value={qpName} onChange={e=>setQpName(e.target.value)}/></div>
              
              <div className="mdl-field-row">
                <div className="mdl-field"><label>💰 PRICE ({sym})</label><input type="number" placeholder="0.00" value={qpPrice} onChange={e=>setQpPrice(e.target.value)}/></div>
                <div className="mdl-field"><label>🏷️ CODE</label><input placeholder="Opt" value={qpCode} onChange={e=>setQpCode(e.target.value)}/></div>
              </div>
              
              <div className="mdl-field"><label>📂 CATEGORY</label><input placeholder="Quick Add" value={qpCat} onChange={e=>setQpCat(e.target.value)}/></div>
              {qpPkg && (
                <div className="mdl-field"><label>🧾 TAX RATE (%)</label><input type="number" placeholder="e.g. 18" value={qpTax} onChange={e=>setQpTax(e.target.value)}/></div>
              )}
              
              <div className="qp-toggles">
                <label className="tg-lbl"><input type="checkbox" checked={qpVeg} onChange={e=>setQpVeg(e.target.checked)}/> <span className="tg-slider veg"/> Pure Veg</label>
                <label className="tg-lbl"><input type="checkbox" checked={qpPkg} onChange={e=>setQpPkg(e.target.checked)}/> <span className="tg-slider pkg"/> Packaged</label>
              </div>

              <div className="mdl-acts-row" style={{marginTop:'8px'}}>
                <button className="mdl-btn-discard" onClick={()=>setShowQuickProduct(false)}>Discard</button>
                <button className="mdl-btn-confirm theme-bg" disabled={qpSaving} onClick={createQuickProduct}>{qpSaving?'Saving…':'Confirm & Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      <style jsx global>{`
        .content-area { padding: 0 !important; }
        .dashboard-header { border-bottom: 1px solid #e2e8f0; }
        .mdl-ov{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;animation:vmFade .2s}
        .mdl-box{background:#fff;border-radius:20px;width:100%;overflow:hidden;position:relative;animation:vmSlide .3s cubic-bezier(0.16,1,0.3,1);box-shadow:0 30px 60px rgba(0,0,0,0.12); border:1px solid #e2e8f0; border-top:3px solid #f97316}
        .theme-bg{background:rgba(var(--rgb), 0.05) !important;color:var(--theme) !important}
        .theme-text{color:var(--theme)}
        .mdl-hdr{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9}
        .mdl-hdr-info{display:flex;flex-direction:column;gap:2px}
        .mdl-hdr-t{margin:0;font-size:17px;font-weight:900;color:inherit}
        .mdl-hdr-sub{font-size:9px;font-weight:800;letter-spacing:0.5px;opacity:0.6;text-transform:uppercase;color:inherit}
        .mdl-hdr-x{width:28px;height:28px;border-radius:8px;border:none;background:rgba(0,0,0,0.05);color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s}
        .mdl-hdr-x:hover{background:rgba(0,0,0,0.1);transform:rotate(90deg)}
        .mdl-body{padding:20px;display:flex;flex-direction:column;gap:16px;background:#fff}
        .mdl-field-row{display:flex;gap:12px}
        .mdl-field-row > div{flex:1}
        .mdl-field{display:flex;flex-direction:column;gap:6px}
        .mdl-field label{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;display:flex;align-items:center;gap:6px}
        .mdl-field input{width:100%;padding:12px 16px;border:2px solid #f1f5f9;border-radius:12px;outline:none;font:600 14px inherit;background:#f8fafc;color:#0f172a}
        .mdl-field input:focus{border-color:var(--theme);background:#fff}
        .mdl-field input::placeholder{color:#cbd5e1}
        .qp-toggles{display:flex;gap:24px;margin-top:8px;padding-top:16px;border-top:1px solid #f1f5f9}
        .tg-lbl{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#0f172a;cursor:pointer}
        .tg-lbl input{display:none}
        .tg-slider{width:40px;height:22px;background:#cbd5e1;border-radius:20px;position:relative;transition:.3s}
        .tg-slider::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;background:#fff;border-radius:50%;transition:.3s}
        .tg-lbl input:checked + .tg-slider.veg{background:#16a34a}
        .tg-lbl input:checked + .tg-slider.pkg{background:#3b82f6}
        .tg-lbl input:checked + .tg-slider::after{transform:translateX(18px)}
        .mdl-acts-row{display:flex;gap:10px;margin-top:4px}
        .mdl-btn-discard{flex:1;padding:12px;border-radius:10px;border:2px solid #f1f5f9;background:#fff;color:#94a3b8;font:800 12px inherit;cursor:pointer;transition:.2s}
        .mdl-btn-discard:hover{background:#f8fafc;color:#64748b}
        .mdl-btn-confirm{flex:1;padding:12px;border-radius:10px;border:none;background:var(--theme);color:#fff;font:800 12px inherit;cursor:pointer;transition:.2s;box-shadow:0 4px 12px rgba(var(--rgb),0.2)}
        .mdl-btn-confirm:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 8px 16px rgba(var(--rgb),0.3)}
        .mdl-settled{display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;background:#f8fafc;border-radius:16px;margin-bottom:20px}
        .mdl-settled span{font-size:12px;font-weight:700;color:#94a3b8}
        .mdl-settled b{font-size:24px;font-weight:900}
        .pay-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .pay-opt{padding:12px;border-radius:12px;border:2px solid #f1f5f9;background:#fff;cursor:pointer;font:700 12px inherit}
        .pay-opt.on{border-color:var(--pc);background:rgba(var(--pc),0.05);color:var(--pc)}
        .cust-list{max-height:300px;overflow-y:auto;margin-top:10px}
        .cust-item{display:flex;align-items:center;gap:12px;width:100%;padding:10px;border-radius:12px;border:none;background:transparent;cursor:pointer;text-align:left}
        .cust-item:hover{background:#f8fafc}
        .cust-av{width:40px;height:40px;border-radius:10px;background:#fff7ed;color:#f97316;display:flex;align-items:center;justify-content:center;font-weight:900}
        .cust-info{flex:1}
        .cust-nm{font-size:14px;font-weight:700;color:#0f172a}
        .cust-ph{font-size:11px;color:#94a3b8}
        @keyframes vmFade{from{opacity:0}to{opacity:1}}
        @keyframes vmSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}

        .edit-modal-box{background:#fff;border-radius:32px;width:95%;max-width:900px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 50px 100px rgba(0,0,0,0.25);animation:vmSlide .4s cubic-bezier(0.16,1,0.3,1)}
        .em-hdr{padding:24px 30px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #f1f5f9}
        .em-main{flex:1;overflow:hidden;display:flex;background:#f8fafc}
        .em-list-panel{flex:1.4;padding:24px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #f1f5f9}
        .em-summary-panel{flex:1;padding:24px;background:#fff;overflow-y:auto;display:flex;flex-direction:column;gap:20px}
        .em-search-wrap{position:relative;margin-bottom:8px}
        .em-search{width:100%;padding:14px 16px 14px 44px;border:2px solid #e2e8f0;border-radius:16px;outline:none;font:600 14px inherit;background:#fff;transition:.2s}
        .em-search:focus{border-color:var(--theme);box-shadow:0 0 0 4px rgba(var(--rgb),0.1)}
        .em-s-ic{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:#94a3b8}
        .em-sugg{position:absolute;top:100%;left:0;right:0;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.1);z-index:100;margin-top:8px;border:1px solid #e2e8f0;overflow:hidden}
        .em-sugg-item{padding:12px 16px;display:flex;justify-content:space-between;cursor:pointer;transition:.2s}
        .em-sugg-item:hover{background:#f8fafc}
        .em-item{background:#fff;padding:16px;border-radius:20px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.02);border:1px solid #f1f5f9}
        .em-item-nm{font-size:14px;font-weight:700;color:#0f172a}
        .em-item-pr{font-size:12px;font-weight:800;color:#64748b}
        .em-qty-ctrl{display:flex;align-items:center;gap:12px;background:#f1f5f9;padding:4px;border-radius:12px}
        .em-qty-btn{width:28px;height:28px;border-radius:8px;border:none;background:#fff;color:#0f172a;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 2px 4px rgba(0,0,0,0.05)}
        .em-qty-val{font-size:14px;font-weight:900;min-width:20px;text-align:center}
        .em-del{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#ef4444;background:#fef2f2;cursor:pointer;transition:.2s}
        .em-del:hover{background:#fee2e2;transform:scale(1.05)}
        .ctx-bk{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;border:none;color:#64748b;cursor:pointer;transition:.2s}
        .ctx-bk:hover{background:#e2e8f0;color:#0f172a;transform:rotate(90deg)}
      `}</style>

      <style jsx>{POS_CSS}</style>
      <style jsx>{SETUP_CSS}</style>

      {showEditModal && editingOrderData && (
        <div style={{position:'fixed', inset:0, zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(12px)', background:'rgba(15, 23, 42, 0.15)'}}>
          <div className="edit-modal-box">
            <div className="em-hdr">
              <div>
                <div style={{fontSize:'12px', fontWeight:800, color: 'var(--theme)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Order Management</div>
                <div style={{fontSize:'20px', fontWeight:900, color:'#0f172a'}}>Review Order {editingOrderNo}</div>
              </div>
              <button className="ctx-bk" onClick={() => setShowEditModal(false)}><FaTimes/></button>
            </div>
            
            <div className="em-main">
              <div className="em-list-panel">
                <div className="em-search-wrap">
                  <FaSearch className="em-s-ic"/>
                  <input className="em-search" placeholder="Add items to this order..." 
                    value={search} onChange={e => setSearch(e.target.value)}/>
                  {search && (
                    <div className="em-sugg">
                      {products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 5).map(p => (
                        <div key={p.id} className="em-sugg-item" onClick={() => {
                          const ex = editingOrderData?.lines?.find(l => l.pid === p.id);
                          if (ex) {
                            setEditingOrderData(prev => ({
                              ...prev,
                              lines: prev.lines.map(l => l.pid === p.id ? { ...l, qty: l.qty + 1 } : l)
                            }));
                          } else {
                            setEditingOrderData(prev => ({
                              ...prev,
                              lines: [{ 
                                pid: p.id, name: p.name, price: p.price, qty: 1, 
                                tax: p.taxRate || defaultTaxRate, uom: p.uomName || 'units' 
                              }, ...(editingOrderData?.lines || [])]
                            }));
                          }
                          setSearch('');
                        }}>
                          <span style={{fontWeight:700, fontSize:'13px'}}>{p.name}</span>
                          <span style={{fontWeight:800, color:'var(--theme)'}}>{sym}{p.price}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {editingOrderData?.lines?.map((l, idx) => (
                  <div key={idx} className="em-item">
                    <div className="em-item-info">
                      <div className="em-item-nm">{l.name}</div>
                      <div className="em-item-pr">{sym}{l.price.toFixed(2)}</div>
                    </div>
                    <div className="em-qty-ctrl">
                      <button className="em-qty-btn" onClick={() => {
                         setEditingOrderData(prev => ({
                           ...prev,
                           lines: prev.lines.map((li, i) => i === idx ? { ...li, qty: Math.max(1, li.qty - 1) } : li)
                         }));
                      }}><FaMinus/></button>
                      <span className="em-qty-val">{l.qty}</span>
                      <button className="em-qty-btn" onClick={() => {
                         setEditingOrderData(prev => ({
                           ...prev,
                           lines: prev.lines.map((li, i) => i === idx ? { ...li, qty: li.qty + 1 } : li)
                         }));
                      }}><FaPlus/></button>
                    </div>
                    <div className="em-del" onClick={() => {
                      setEditingOrderData(prev => ({
                        ...prev,
                        lines: prev.lines.filter((_, i) => i !== idx)
                      }));
                    }}><FaTrash/></div>
                  </div>
                ))}
              </div>

              <div className="em-summary-panel">
                <div style={{flex:1}}>
                  <div style={{marginBottom:'20px'}}>
                    <div style={{fontSize:'11px', fontWeight:800, color:'#94a3b8', marginBottom:'8px', textTransform:'uppercase'}}>Fulfillment</div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'}}>
                      {FULFILLMENT.map(f => (
                        <button key={f.key} 
                          onClick={() => setEditingOrderData(p => ({ ...p, fulfillmentType: f.key }))}
                          style={{
                            padding:'10px', borderRadius:'14px', border:'1px solid #f1f5f9',
                            background: editingOrderData?.fulfillmentType === f.key ? f.color + '10' : '#fff',
                            color: editingOrderData?.fulfillmentType === f.key ? f.color : '#64748b',
                            display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', transition:'0.2s',
                            fontSize:'11px', fontWeight:800
                          }}
                        >
                          {f.icon} {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{background:'#f8fafc', padding:'20px', borderRadius:'24px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    {(() => {
                      const mTotals = calculateOrderTotals(
                        (editingOrderData?.lines || []).map(l => ({ ...l, quantity: l.qty, tax_rate: l.tax })),
                        discount,
                        { gst_enabled: taxOn, default_tax_rate: defaultTaxRate, prices_include_tax: pricesInclTax }
                      );
                      return (
                        <>
                          <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', fontWeight:600, color:'#64748b'}}>
                            <span>Subtotal</span>
                            <span>{sym}{mTotals.gross_face_total.toFixed(2)}</span>
                          </div>
                          <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', fontWeight:600, color:'#64748b'}}>
                            <span>Tax</span>
                            <span>{sym}{mTotals.total_tax.toFixed(2)}</span>
                          </div>
                          <div style={{height:'1px', background:'#e2e8f0', margin:'4px 0'}}/>
                          <div style={{display:'flex', justifyContent:'space-between', fontSize:'18px', fontWeight:900, color:'#0f172a'}}>
                            <span>Total</span>
                            <span style={{color:'var(--theme)'}}>{sym}{mTotals.total_amount.toFixed(0)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <button className="vm-pill" style={{width:'100%', padding:'18px', borderRadius:'20px', background:'var(--theme)', color:'#fff', border:'none', fontSize:'14px', fontWeight:900, boxShadow:'0 10px 25px var(--theme-glow)', cursor:'pointer'}} 
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const mTotals = calculateOrderTotals(
                        editingOrderData.lines.map(l => ({ ...l, quantity: l.qty, tax_rate: l.tax })),
                        discount,
                        { gst_enabled: taxOn, default_tax_rate: defaultTaxRate, prices_include_tax: pricesInclTax }
                      );
                      const payload = {
                        ...editingOrderData,
                        totalAmount: +mTotals.total_inc_tax.toFixed(2),
                        totalTaxAmount: +mTotals.total_tax.toFixed(2),
                        grandTotal: +mTotals.total_amount.toFixed(2),
                        lines: editingOrderData.lines.map(l => ({
                          productId: l.pid, quantity: l.qty, unitPrice: l.price,
                          unitOfMeasure: l.uom, taxRate: l.tax,
                          taxAmount: +((l.price * l.qty * l.tax) / 100).toFixed(2),
                          lineTotal: +((l.price * l.qty) * (1 + l.tax/100)).toFixed(2)
                        }))
                      };
                      await api.put(`/api/v1/orders/${editingOrderData.id}`, payload);
                      
                      // Differential Print Logic
                      try {
                        const { buildReceiptText } = await import('../../utils/printUtils');
                        const { printUniversal } = await import('../../utils/printGateway');
                        const printPayload = { ...payload, originalLines: editingOrderData.originalLines };
                        const text = buildReceiptText(printPayload, null, config);
                        await printUniversal({ text, jobKind: 'receipt' });
                      } catch (err) { console.error('Differential Print Failed', err); }

                      showToast('Order Updated Successfully!');
                      setShowEditModal(false);
                      fetchOrders();
                    } catch (e) { showToast('Update failed', 'error'); }
                    finally { setSaving(false); }
                }}>
                  {saving ? 'Saving...' : 'Update Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .vm-pill.micro.lite{
          padding:12px 4px; border:none; border-radius:18px; cursor:pointer; font:900 10px inherit; 
          text-transform:uppercase; letter-spacing:0.04em; transition:.3s; text-align:center;
        }
        .vm-pill.edit{ background:#eff6ff; color:#3b82f6; }
        .vm-pill.bill{ background:#fff7ed; color:#f97316; }
        .vm-pill.complete{ background:#f0fdf4; color:#10b981; }
        .vm-pill.cancel{ background:#fef2f2; color:#ef4444; }
        
        .vm-pill:hover{ filter:brightness(0.97); transform:scale(1.02); }
        .vm-pill:active{ transform:scale(0.98); }
        .h-scale:hover{ transform:rotate(90deg) scale(1.1); background:#fef2f2 !important; }

        .edit-modal-box {
          width: 90%;
          max-width: 900px;
          height: 80vh;
          background: #fff;
          border-radius: 32px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 40px 100px -20px rgba(0,0,0,0.25);
        }
        .em-hdr { padding: 24px 32px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #fff; }
        .em-main { flex: 1; display: grid; grid-template-columns: 1fr 340px; overflow: hidden; }
        .em-list-panel { padding: 24px 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; background: #f8fafc; }
        .em-summary-panel { padding: 24px; border-left: 1px solid #f1f5f9; background: #fff; display: flex; flex-direction: column; }
        
        .em-item { 
          background: #fff; padding: 16px; border-radius: 20px; display: flex; align-items: center; gap: 16px;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03); border: 1px solid #f1f5f9;
        }
        .em-item-info { flex: 1; }
        .em-item-nm { font-size: 14px; font-weight: 800; color: #0f172a; }
        .em-item-pr { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 2px; }
        .em-qty-ctrl { display: flex; align-items: center; gap: 12px; background: #f8fafc; padding: 4px; border-radius: 12px; }
        .em-qty-btn { width: 28px; height: 28px; border: none; background: #fff; border-radius: 8px; color: #0f172a; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .em-qty-val { font-size: 14px; font-weight: 900; min-width: 20px; text-align: center; }
        .em-del { color: #ef4444; cursor: pointer; padding: 8px; opacity: 0.5; transition: 0.2s; }
        .em-del:hover { opacity: 1; transform: scale(1.1); }
        
        .em-search-wrap { margin-bottom: 8px; position: relative; }
        .em-search { width: 100%; padding: 12px 16px 12px 40px; border-radius: 16px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 13px; font-weight: 600; outline: none; transition: 0.2s; }
        .em-search:focus { background: #fff; border-color: var(--theme); box-shadow: 0 0 0 4px var(--theme-glow); }
        .em-s-ic { position: absolute; left: 16px; top: 14px; color: #94a3b8; font-size: 14px; }
        
        .em-sugg { position: absolute; top: calc(100% + 8px); left: 0; right: 0; background: #fff; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 1px solid #f1f5f9; z-index: 10; max-height: 200px; overflow-y: auto; }
        .em-sugg-item { padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s; }
        .em-sugg-item:hover { background: #f8fafc; color: var(--theme); }
        
        .em-ft { padding: 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; }
      `}</style>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      {printOrder && (
        <KotPrint 
          order={printOrder} 
          kind={printKind} 
          onClose={() => setPrintOrder(null)} 
          autoPrint={true}
        />
      )}
    </DashboardLayout>
  );
}

function Toast({msg,type,onClose}){
  return (
    <div className={`tst ${type}`} onClick={onClose}>
      <div className="tst-i">{type==='success'?<FaCheck/>:<FaExclamationCircle/>}</div>
      <div className="tst-m">{msg}</div>
      <style jsx>{`.tst{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:white;padding:12px 20px;border-radius:16px;display:flex;align-items:center;gap:12px;z-index:99999;box-shadow:0 20px 40px rgba(0,0,0,0.2);cursor:pointer;animation:tIn .3s}.tst.error{background:#ef4444}@keyframes tIn{from{transform:translate(-50%,20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}`}</style>
    </div>
  );
}

const POS_CSS = `
/* Premium UI Upgrades matching Cafe-QR */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

.pos-container {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 64px);
  background: #fcfdfe;
  overflow: hidden;
  color: #0f172a;
  --theme-glow: rgba(var(--rgb), 0.05);
  font-family: 'Outfit', 'Inter', sans-serif;
  animation: fadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  border-top: none;
}

.pos-hdr {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  z-index: 50;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
  gap: 16px;
  flex-wrap: wrap;
  border-radius: 0 0 24px 24px;
  margin-bottom: 24px;
}

.pos-hdr-l, .pos-hdr-r { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pos-hdr-controls { display: flex; align-items: center; min-width: 0; overflow: hidden; }

.hdr-context-group {
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 4px;
  gap: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
.hdr-divider { width: 1px; height: 28px; background: #e2e8f0; margin: 0 8px; }

.mode-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: 12px; border: none; background: transparent;
  color: #64748b; font: 800 13px inherit; cursor: pointer; transition: 0.3s;
}
.mode-btn.active {
  background: var(--theme); color: white;
  box-shadow: 0 6px 16px rgba(var(--rgb), 0.3);
  transform: translateY(-2px);
}
.mode-btn:hover:not(.active) { background: #f8fafc; color: #0f172a; }

.ctx-bk, .eb-x {
  width: 40px; height: 40px; border-radius: 12px; border: 1px solid #e2e8f0;
  background: white; color: #64748b; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
.ctx-bk:hover, .eb-x:hover { border-color: var(--theme); color: var(--theme); box-shadow: 0 4px 12px rgba(var(--rgb), 0.15); transform: translateY(-1px); }

.pos-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 24px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 24px 24px 24px;
}
.pos-main.full { grid-template-columns: 1fr; }

.catalog {
  background: transparent;
  min-width: 0; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 24px;
  padding: 0;
}

/* Search Bar matching counter.js */
.ps-bar-wrapper {
  display: flex; align-items: center; background: white; border: 1.5px solid #e2e8f0;
  border-radius: 16px; padding: 6px 8px 6px 20px; transition: 0.3s;
  box-shadow: 0 4px 10px -2px rgba(0,0,0,0.03);
}
.ps-bar-wrapper:focus-within { border-color: var(--theme); box-shadow: 0 10px 15px -3px rgba(var(--rgb), 0.15); }
.ps-in { flex: 1; border: none; outline: none; background: transparent; padding: 12px 10px; font: 600 15px inherit; color: #0f172a; }
.ps-in::placeholder { color: #94a3b8; }
.ps-ic { color: var(--theme); font-size: 18px; }

.ps-add-btn {
  width: 40px; height: 40px; background: linear-gradient(135deg, var(--theme), rgba(var(--rgb),0.8));
  color: white; border: none; border-radius: 12px; cursor: pointer; transition: 0.2s;
  box-shadow: 0 4px 12px rgba(var(--rgb), 0.3); display: flex; align-items: center; justify-content: center;
}
.ps-add-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(var(--rgb), 0.4); }

/* Filter Pills */
.cats-scroll { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
.cats-scroll::-webkit-scrollbar { display: none; }
.cat-orb {
  padding: 10px 20px; border-radius: 99px; background: white; border: 1.5px solid #e2e8f0;
  cursor: pointer; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; align-items: center; justify-content: center;
}
.cat-orb.on {
  background: linear-gradient(135deg, var(--theme), rgba(var(--rgb),0.8));
  border-color: transparent; box-shadow: 0 6px 16px rgba(var(--rgb), 0.3); transform: translateY(-2px);
}
.cat-orb-t { font-size: 13px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.cat-orb.on .cat-orb-t { color: white; }
.cat-orb:hover:not(.on) { border-color: var(--theme); color: var(--theme); transform: translateY(-1px); }

/* Product Grid */
.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; align-content: start; }
.pc-card {
  background: white; border-radius: 20px; overflow: hidden; border: 1.5px solid #f1f5f9;
  transition: 0.3s; display: flex; flex-direction: column; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
}
.pc-card:hover { transform: translateY(-6px); box-shadow: 0 20px 25px -5px rgba(var(--rgb), 0.12); border-color: rgba(var(--rgb), 0.3); }
.pc-img-v { aspect-ratio: 1.4; background-size: cover; background-position: center; background-color: #f8fafc; }
.pc-body { padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.pc-nm { font-size: 14px; font-weight: 800; color: #0f172a; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pc-pr-row { display: flex; justify-content: space-between; align-items: center; margin-top: auto; }
.pc-pr { font-size: 16px; font-weight: 900; color: var(--theme); }
.pc-add {
  width: 32px; height: 32px; border-radius: 10px; border: 1.5px solid rgba(var(--rgb),0.2); background: rgba(var(--rgb),0.05);
  color: var(--theme); cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center;
}
.pc-add:hover { background: var(--theme); color: white; transform: scale(1.1); box-shadow: 0 4px 10px rgba(var(--rgb), 0.3); }

/* Cart Sidebar */
.cart-panel {
  background: white; border-radius: 24px; display: flex; flex-direction: column; color: #0f172a;
  box-shadow: 0 10px 40px -10px rgba(0,0,0,0.1); z-index: 10; border: 1px solid #f1f5f9; overflow: hidden;
}
.cp-hd { padding: 20px 24px; background: linear-gradient(135deg, var(--theme), rgba(var(--rgb),0.8)); color: white; border-bottom: none; }
.ts-label { color: rgba(255,255,255,0.9); }
.ts-input { border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.15); color: white; font-size: 14px; }
.ts-input:focus { border-color: white; background: rgba(255,255,255,0.25); }

.cp-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #fcfdfe; }
.ci-card {
  display: flex; gap: 12px; padding: 12px 16px; border-radius: 16px; background: white;
  border: 1.5px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02); transition: 0.3s; align-items: center;
}
.ci-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.06); border-color: rgba(var(--rgb),0.3); }
.ci-img { width: 44px; height: 44px; border-radius: 12px; }
.ci-nm { font-size: 14px; font-weight: 800; color: #0f172a; }
.ci-pr { font-size: 14px; font-weight: 900; color: #64748b; }
.ci-qty { display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 4px 6px; border-radius: 12px; border: 1px solid #e2e8f0; }
.ci-q-btn { width: 28px; height: 28px; border-radius: 8px; background: white; color: #475569; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
.ci-q-btn:hover { background: var(--theme); color: white; }
.ci-q-val { font-size: 13px; font-weight: 800; min-width: 20px; text-align: center; }

.cp-ft { padding: 24px; background: white; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 16px; }
.cp-summary { display: flex; flex-direction: column; gap: 8px; background: transparent; border: none; padding: 0; }
.cp-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; color: #64748b; }
.cp-row.tot { font-size: 24px; font-weight: 900; color: #0f172a; margin-top: 8px; padding-top: 12px; border-top: 2px dashed #e2e8f0; }
.cp-main-act {
  padding: 16px; border-radius: 16px; border: none; background: linear-gradient(135deg, var(--theme), rgba(var(--rgb),0.8));
  color: white; font: 900 16px inherit; cursor: pointer; box-shadow: 0 8px 20px rgba(var(--rgb),0.3); transition: 0.3s;
}
.cp-main-act:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(var(--rgb),0.4); }
.cp-main-act:disabled { opacity: 0.6; cursor: not-allowed; }

/* Table Management (from tables.js) */
.vm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; justify-content: start; }
.vm-node {
  width: 100%; aspect-ratio: unset; height: 160px; border-radius: 24px; border: 2.5px solid transparent;
  background: white; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center;
  transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(0,0,0,0.04); position: relative;
}
.vm-node:hover { transform: translateY(-6px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
.vm-node.av { border-color: #10b981; }
.vm-node.av .vm-node-n { color: #064e3b; }
.vm-node.av .vm-node-s { background: #d1fae5; color: #059669; padding: 6px 16px; border-radius: 99px; margin-top: 12px; font-size: 13px; font-weight: 800; border: none; }
.vm-node.occ { border-color: #ef4444; background: linear-gradient(135deg, #fef2f2, #fee2e2); box-shadow: 0 10px 24px rgba(239,68,68,0.2); }
.vm-node.occ .vm-node-n { color: #991b1b; }
.vm-node.occ .vm-node-s { background: #ef4444; color: white; padding: 6px 16px; border-radius: 99px; margin-top: 12px; font-size: 13px; font-weight: 800; border: none; }
.vm-node.bld { border-color: #0ea5e9; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); }
.vm-node-n { font-size: 36px; font-weight: 900; letter-spacing: -0.03em; }

/* Miscellaneous */
.op-view { padding: 0 24px; flex: 1; }
.ov-card { border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); border: 1.5px solid #f1f5f9; }
.ov-card:hover { box-shadow: 0 10px 20px rgba(0,0,0,0.06); transform: translateY(-2px); }
.vm-overlay { background: rgba(15,23,42,0.6); backdrop-filter: blur(8px); }
.vm-modal { border-radius: 32px; border: none; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
.vm-top-strip { padding: 24px 32px; border-radius: 32px 32px 0 0; }
.cust-chips { gap: 8px; }
.cust-chip { background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }

@media(max-width:1200px) {
  .pos-main { grid-template-columns: 1fr; padding: 16px; }
  .cart-panel { margin-top: 24px; }
}
`;

const SETUP_CSS = ``;
const MODAL_CSS = ``;
