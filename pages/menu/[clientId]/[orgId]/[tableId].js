import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { FaShoppingCart, FaSearch, FaMinus, FaPlus, FaCheckCircle, FaExclamationCircle, FaTimes, FaMobileAlt, FaArrowRight, FaSignInAlt, FaUser } from 'react-icons/fa';
import api from '../../../../utils/api';

export default function QRMenuPage() {
  const router = useRouter();
  const { clientId, orgId, tableId } = router.query;

  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  
  const [tableInfo, setTableInfo] = useState(null);
  
  const [cart, setCart] = useState({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Auth state (STRICT LOGIN)
  const [customer, setCustomer] = useState(null);
  const [authStep, setAuthStep] = useState(1); // 1 = input, 2 = otp input
  const [authIdentifier, setAuthIdentifier] = useState(''); // email or phone
  const [authName, setAuthName] = useState('');
  const [authOtp, setAuthOtp] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [toast, setToast] = useState(null); // { msg, type: 'success' | 'error' }
  
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState('cash');

  useEffect(() => {
    if (clientId && tableId) {
      // Check local storage for customer
      let cust = null;
      try {
        const storedCustomer = localStorage.getItem(`qr_customer_${clientId}`);
        if (storedCustomer) {
          cust = JSON.parse(storedCustomer);
          setCustomer(cust);
        }
      } catch (e) {}
      
      loadData(cust);
    }
  }, [clientId, orgId, tableId]);

  useEffect(() => {
    if (tableInfo?.onlinePaymentEnabled === false) {
      setSelectedPayment('cash');
    }
  }, [tableInfo?.onlinePaymentEnabled]);

  const loadData = async (activeCustomer) => {
    try {
      setLoading(true);
      // Fetch table info
      const tableRes = await api.get(`/api/v1/public/menu/${clientId}/${orgId || 'null'}/table/${tableId}`);
      if (tableRes.data?.success && tableRes.data?.data?.found) {
        setTableInfo(tableRes.data.data);
      } else {
        setTableInfo({ error: 'Invalid QR Code or Table Not Found' });
      }

      // If customer is already logged in, we fetch the menu immediately
      // Actually, we can fetch menu in background so it's ready once logged in
      const menuRes = await api.get(`/api/v1/public/menu/${clientId}/${orgId || 'null'}`);
      if (menuRes.data?.success) {
        const items = menuRes.data.data || [];
        setMenu(items);
        const cats = new Set(items.map(i => i.category || 'Others'));
        setCategories(['All', ...Array.from(cats)]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredMenu = menu.filter(item => {
    if (activeCategory !== 'All' && item.category !== activeCategory && (item.category || 'Others') !== activeCategory) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const addToCart = (item) => {
    setCart(prev => ({
      ...prev,
      [item.id]: {
        ...item,
        quantity: (prev[item.id]?.quantity || 0) + 1
      }
    }));
  };

  const removeFromCart = (itemId) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[itemId].quantity > 1) {
        newCart[itemId].quantity -= 1;
      } else {
        delete newCart[itemId];
      }
      return newCart;
    });
  };

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const requestOtp = async () => {
    if (!authIdentifier) return showToast('Please enter your mobile number or email', 'error');
    console.log('[QRMenu] requestOtp started for:', authIdentifier);
    setAuthLoading(true);
    try {
      const res = await api.post(`/api/v1/public/customer/send-otp`, { identifier: authIdentifier });
      console.log('[QRMenu] OTP Success, setting step 2. Response:', res.data);
      setAuthStep(prev => 2);
      showToast('Verification code sent!', 'success');
    } catch (e) {
      console.error('[QRMenu] OTP Error:', e.response?.data || e.message);
      showToast(e.response?.data?.message || 'Failed to send OTP. Please try again.', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!authOtp) return showToast('Please enter the OTP', 'error');
    setAuthLoading(true);
    try {
      const res = await api.post(`/api/v1/public/customer/verify-otp`, {
        identifier: authIdentifier,
        name: authName,
        otp: authOtp,
        clientId,
        orgId
      });
      if (res.data?.success) {
        const cust = res.data.data;
        setCustomer(cust);
        localStorage.setItem(`qr_customer_${clientId}`, JSON.stringify(cust));
        showToast(`Welcome back, ${cust.name}!`);
      }
    } catch (e) {
      showToast('Invalid OTP. Please try again.', 'error');
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    setCustomer(null);
    localStorage.removeItem(`qr_customer_${clientId}`);
    setAuthStep(1);
    setCart({}); // clear cart on logout
  };

  const loadRazorpayCheckout = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(script);
  });

  const submitOrder = async (paymentDetails = {}, manageLoading = true) => {
    if (cartCount === 0) return;
    if (manageLoading) setAuthLoading(true);
    try {
      const payload = {
        tableId: tableId,
        tableNumber: tableInfo?.tableNumber || 'QR',
        customerId: customer?.customerId,
        paymentStatus: paymentDetails.paymentStatus || 'PENDING',
        paymentMethod: paymentDetails.paymentMethod || 'CASH',
        razorpayPaymentId: paymentDetails.razorpayPaymentId,
        razorpayOrderId: paymentDetails.razorpayOrderId,
        items: cartItems.map(i => ({
          productId: i.id,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          price: i.price
        }))
      };
      const res = await api.post(`/api/v1/public/menu/${clientId}/${orgId || 'null'}/order`, payload);
      if (res.data?.success) {
        setCart({});
        setIsCartOpen(false);
        setOrderSuccess(res.data.data);
      }
    } catch (e) {
      if (manageLoading) alert('Failed to place order. Please call a waiter.');
      throw e;
    } finally {
      if (manageLoading) setAuthLoading(false);
    }
  };

  const handleOnlinePayment = async () => {
    if (cartCount === 0) return;
    setAuthLoading(true);
    try {
      await loadRazorpayCheckout();
      const orderResponse = await api.post('/api/v1/public/payments/create-order', {
        amount: cartTotal,
        currency: 'INR',
        receipt: `qr_${Date.now()}`,
        customerName: customer?.name,
        customerEmail: customer?.email,
        customerPhone: customer?.phone,
        metadata: {
          purpose: 'qr_order',
          client_id: clientId,
          org_id: orgId || 'null',
          table_id: tableId,
          table_number: tableInfo?.tableNumber || 'QR'
        }
      });

      const payment = orderResponse.data?.data;
      if (!payment?.orderId || !payment?.keyId) {
        throw new Error('Unable to start online payment');
      }

      await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: payment.keyId,
          amount: payment.amount,
          currency: payment.currency || 'INR',
          name: tableInfo?.restaurantName || 'Restaurant',
          description: `Table ${tableInfo?.tableNumber || 'QR'} Order`,
          order_id: payment.orderId,
          prefill: {
            name: customer?.name || '',
            email: customer?.email || '',
            contact: customer?.phone || ''
          },
          theme: { color: brandColor },
          handler: async (response) => {
            try {
              await api.post('/api/v1/public/payments/verify', {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature
              });

              await submitOrder({
                paymentStatus: 'PAID',
                paymentMethod: 'RAZORPAY',
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id
              }, false);
              resolve(true);
            } catch (err) {
              reject(err);
            }
          },
          modal: {
            ondismiss: () => resolve(false)
          }
        });
        checkout.open();
      });
    } catch (e) {
      console.error(e);
      showToast(e.response?.data?.message || e.message || 'Online payment failed', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const placeOrder = async () => {
    if (selectedPayment === 'online') {
      await handleOnlinePayment();
      return;
    }
    await submitOrder({ paymentStatus: 'PENDING', paymentMethod: 'CASH' });
  };

  // --- RENDERING SCREENS ---

  if (loading) {
    return (
      <div className="qr-loader">
        <div className="spinner"></div>
        <p>Loading Experience...</p>
        <style jsx>{`
          .qr-loader { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f172a; color: white; font-family: 'Inter', sans-serif; padding: 24px; }
          .spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-top-color: var(--brand-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 24px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (tableInfo?.error) {
    return (
      <div className="qr-error-screen">
        <FaExclamationCircle className="err-icon" />
        <h2>{tableInfo.error}</h2>
        <p>Please scan a valid table QR code from your table.</p>
        <style jsx>{`
          .qr-error-screen { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f172a; color: white; font-family: 'Inter', sans-serif; text-align: center; padding: 20px; }
          .err-icon { font-size: 64px; margin-bottom: 24px; color: #ef4444; filter: drop-shadow(0 0 20px rgba(239,68,68,0.4)); }
          h2 { margin: 0 0 12px 0; font-weight: 800; font-size: 24px; }
          p { color: #94a3b8; }
        `}</style>
      </div>
    );
  }

  // STRICT LOGIN SCREEN
  const brandColor = tableInfo?.brandColor || '#f97316';
  const restName = tableInfo?.restaurantName || '';
  const onlinePaymentEnabled = !!tableInfo?.onlinePaymentEnabled;

  // Add opacity to the brand color for glowing elements (hex to rgba approximation)
  const brandGlow = brandColor + '30'; // 20% opacity hex
  const brandBg = brandColor + '10'; // 6% opacity hex

  // TABLE OCCUPANCY BLOCK
  if (tableInfo?.status === 'OCCUPIED' && !customer) {
    return (
      <div className="error-screen" style={{ '--brand-color': brandColor }}>
        <FaExclamationCircle className="err-icon" />
        <h2>Table Already Occupied</h2>
        <p>This table is currently in use. Please ask our staff for assistance or choose another table.</p>
        <button className="premium-btn" style={{ marginTop: '24px', width: 'auto' }} onClick={() => window.location.reload()}>
          Refresh Status
        </button>
        <style jsx>{`
          .error-screen { 
            min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 40px; text-align: center; background: #f8fafc;
          }
          .err-icon { font-size: 64px; margin-bottom: 24px; color: #f59e0b; }
          h2 { margin: 0 0 12px 0; font-weight: 800; font-size: 24px; }
          p { color: #64748b; max-width: 300px; line-height: 1.6; }
        `}</style>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="auth-wrapper" style={{ '--brand-color': brandColor, '--brand-glow': brandGlow, '--brand-bg': brandBg }}>
        <Head>
          <title>Welcome - {restName}</title>
        </Head>
        
        {/* Ambient Aurora Background */}
        <div className="bg-aurora">
          <div className="aurora-orb orb-1"></div>
          <div className="aurora-orb orb-2"></div>
        </div>

        <div className="auth-container">
          <header className="auth-header">
            <div className="logo-wrap">
              {tableInfo?.logoUrl ? (
                <img src={tableInfo.logoUrl} alt={restName} className="brand-logo-img" />
              ) : (
                <div className="brand-logo-fallback">{restName?.charAt(0) || 'R'}</div>
              )}
            </div>
            <h1 className="welcome-title" style={{ color: brandColor }}>{restName}</h1>
            <p className="welcome-subtitle">
              Welcome to {tableInfo?.name && tableInfo.name.trim() !== '' ? tableInfo.name : `Table ${tableInfo?.tableNumber}`}
            </p>
          </header>

          <div className="auth-form-area">
            {authStep === 1 && (
              <div className="glass-form-wrapper">
                <div className="unified-form-card">
                   <div className="uf-row">
                    <span className="uf-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </span>
                    <input type="text" placeholder="Your Full Name" value={authName} onChange={e => setAuthName(e.target.value)} />
                  </div>
                  <div className="uf-divider"></div>
                  <div className="uf-row">
                    <span className="uf-icon">
                      {authIdentifier.includes('@') ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      )}
                    </span>
                    <input type="text" placeholder="Mobile or Email" value={authIdentifier} onChange={e => setAuthIdentifier(e.target.value)} />
                  </div>
                </div>
                
                <button className="premium-btn" onClick={requestOtp} disabled={authLoading || !authIdentifier}>
                  {authLoading ? 'Please wait...' : 'Continue'} 
                  {!authLoading && <span className="arrow">→</span>}
                </button>
              </div>
            )}

            {authStep === 2 && (
              <div className="glass-form-wrapper">
                <div className="otp-header-text">
                  Enter the verification code sent to <br/><strong>{authIdentifier}</strong>
                </div>
                
                <div className="unified-form-card otp-card">
                  <input 
                    type="text" 
                    placeholder="0 0 0 0 0 0" 
                    value={authOtp} 
                    onChange={e => setAuthOtp(e.target.value)} 
                    maxLength={6} 
                    className="otp-input"
                  />
                </div>

                <button className="premium-btn" onClick={verifyOtp} disabled={authLoading || authOtp.length < 4}>
                  {authLoading ? 'Verifying...' : 'Unlock Menu'}
                </button>
                
                <div className="otp-actions">
                  <button className="p-link-btn" onClick={() => setAuthStep(1)}>Edit Number</button>
                  <span className="divider"></span>
                  <button className="p-link-btn resend" onClick={requestOtp} disabled={authLoading}>Resend SMS</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          .auth-wrapper {
            position: relative; min-height: 100dvh; background: #f8fafc;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            overflow-x: clip; overflow-y: auto; padding: max(20px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(20px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
          }

          /* Ambient Aurora Background */
          .bg-aurora { position: absolute; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; }
          .aurora-orb {
            position: absolute; width: 70vw; height: 70vw; max-width: 600px; max-height: 600px;
            background: var(--brand-color); border-radius: 50%; filter: blur(80px);
          }
          .orb-1 { top: -20%; left: -10%; opacity: 0.15; animation: floatOrb 20s ease-in-out infinite alternate; }
          .orb-2 { bottom: -10%; right: -20%; opacity: 0.1; animation: floatOrb 25s ease-in-out infinite alternate-reverse; }
          
          @keyframes floatOrb {
            from { transform: translate(0, 0) scale(1); }
            to { transform: translate(50px, 30px) scale(1.1); }
          }

          .auth-container {
            position: relative; z-index: 10; width: 100%; max-width: min(400px, 100%);
            display: flex; flex-direction: column; gap: clamp(24px, 5dvh, 40px);
            animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes slideUpFade { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }

          /* Elegant Header */
          .auth-header { text-align: center; display: flex; flex-direction: column; align-items: center; margin-top: clamp(0px, 3dvh, 20px); min-width: 0; }
          .logo-wrap {
            width: clamp(86px, 28vw, 120px); height: clamp(86px, 28vw, 120px); border-radius: clamp(22px, 7vw, 32px); background: #ffffff;
            box-shadow: 0 20px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1);
            display: flex; align-items: center; justify-content: center; margin-bottom: 24px;
            border: 2px solid var(--brand-color); overflow: hidden;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }
          .logo-wrap:hover { transform: scale(1.05) rotate(2deg); box-shadow: 0 25px 50px var(--brand-glow); }
          .brand-logo-img { width: 100%; height: 100%; object-fit: contain; padding: 10px; }
          .brand-logo-fallback { font-size: 56px; font-weight: 800; color: var(--brand-color); }
          
          .welcome-title { margin: 0; font-size: clamp(26px, 8vw, 36px); font-weight: 900; color: #0f172a; letter-spacing: -1px; transition: color 0.3s; overflow-wrap: anywhere; }
          .welcome-subtitle { margin: 8px 0 0 0; font-size: clamp(12px, 3.8vw, 16px); color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; overflow-wrap: anywhere; }

          /* Unified Glass Form */
          .auth-form-area { width: 100%; }
          .glass-form-wrapper { display: flex; flex-direction: column; gap: 20px; }
          
          .unified-form-card {
            background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 1); border-radius: 24px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1);
            overflow: hidden;
          }
          
          .uf-row { display: flex; align-items: center; padding: 18px clamp(16px, 5vw, 24px); background: transparent; transition: background 0.2s; min-width: 0; }
          .uf-row:focus-within { background: #ffffff; }
          .uf-icon { display: flex; color: #94a3b8; margin-right: 16px; transition: color 0.2s; }
          .uf-row:focus-within .uf-icon { color: var(--brand-color); }
          
          .uf-row input {
            flex: 1; min-width: 0; border: none; background: transparent; outline: none;
            font-size: 16px; font-weight: 600; color: #0f172a; padding: 0;
          }
          .uf-row input::placeholder { color: #cbd5e1; font-weight: 500; }
          
          .uf-divider { height: 1px; background: #e2e8f0; margin: 0 24px; }

          /* OTP Specific Styles */
          .otp-header-text { text-align: center; font-size: 15px; color: #64748b; line-height: 1.5; }
          .otp-header-text strong { color: #0f172a; }
          .otp-card { padding: 8px; }
          .otp-input {
            width: 100%; border: none; background: transparent; outline: none; text-align: center;
            font-size: clamp(22px, 8vw, 28px); font-weight: 800; color: #0f172a; letter-spacing: clamp(5px, 2.4vw, 12px); padding: 16px 0;
          }
          .otp-input::placeholder { color: #cbd5e1; font-weight: 600; letter-spacing: clamp(5px, 2.4vw, 12px); }

          /* Premium Button */
          .premium-btn {
            width: 100%; padding: 18px; border-radius: 100px; border: none;
            background: var(--brand-color); color: white; font-size: 17px; font-weight: 700;
            display: flex; justify-content: center; align-items: center; gap: 8px; cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 10px 25px var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.2);
          }
          .premium-btn .arrow { font-size: 18px; transition: transform 0.3s; }
          .premium-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 15px 35px var(--brand-glow); }
          .premium-btn:hover:not(:disabled) .arrow { transform: translateX(4px); }
          .premium-btn:active { transform: scale(0.98) translateY(0); }
          .premium-btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; box-shadow: none; }

          /* Links */
          .otp-actions { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 8px; }
          .divider { width: 4px; height: 4px; border-radius: 50%; background: #cbd5e1; }
          .p-link-btn { background: transparent; border: none; color: #64748b; font-weight: 600; font-size: 14px; cursor: pointer; transition: color 0.2s; padding: 8px; border-radius: 100px; }
          .p-link-btn:hover { color: #0f172a; background: rgba(0,0,0,0.03); }
          .p-link-btn.resend { color: var(--brand-color); }
          .p-link-btn.resend:disabled { color: #94a3b8; cursor: not-allowed; }
        `}</style>
      </div>
    );
  }

  // MAIN MENU SCREEN
  return (
    <div className="qr-container" style={{ '--brand-color': brandColor, '--brand-glow': brandGlow, '--brand-bg': brandBg }}>
      <div className="qr-content-wrapper">
      <Head>
        <title>Menu - Table {tableInfo?.tableNumber}</title>
      </Head>

      {/* Premium Glass Header */}
      <header className="qr-header">
        <div className="qh-top-bar">
          <div className="qh-brand">
            <div className="qh-logo-wrap">
              {tableInfo?.logoUrl ? (
                <img src={tableInfo.logoUrl} alt={restName} className="qh-logo-img" />
              ) : (
                <span className="qh-logo-fallback">{restName?.charAt(0) || 'R'}</span>
              )}
            </div>
            <div className="qh-greeting">
              <span className="greet-text">Table {tableInfo?.tableNumber}</span>
              <span className="greet-name">{customer.name?.split(' ')[0] || 'Guest'}</span>
            </div>
          </div>
          <button className="qh-logout" onClick={handleLogout}><FaSignInAlt /></button>
        </div>
        
        <div className="qh-search-wrap">
          <FaSearch className="search-icon" />
          <input 
            type="text" 
            placeholder="Search for your cravings..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>

        <div className="qh-categories">
          {categories.map(cat => (
            <button 
              key={cat} 
              className={`cat-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="qr-main">
        {filteredMenu.length === 0 ? (
          <div className="empty-state">
            <div className="empty-circle"></div>
            <h3>No items found</h3>
            <p>Try exploring other categories or clearing your search.</p>
          </div>
        ) : (
          <div className="menu-grid">
            {filteredMenu.map(item => {
              const qtyInCart = cart[item.id]?.quantity || 0;
              const hasImage = !!item.imageUrl;

              // Render DYNAMIC CARD based on image availability
              return (
                <div key={item.id} className={`prod-card ${hasImage ? 'has-image' : 'no-image'}`}>
                  {/* Veg/Non-Veg Indicator */}
                  {item.isVeg !== undefined && (
                    <div className={`diet-indicator ${item.isVeg ? 'veg' : 'non-veg'}`}></div>
                  )}

                  {/* Image Layout */}
                  {hasImage && (
                    <div className="pc-cover">
                      <img src={item.imageUrl} alt={item.name} />
                      <div className="pc-price-tag">₹{Number(item.price).toFixed(0)}</div>
                    </div>
                  )}

                  <div className="pc-content">
                    <div className="pc-info">
                      <h3 className="pc-title">{item.name}</h3>
                      {!hasImage && <span className="pc-price-text">₹{Number(item.price).toFixed(2)}</span>}
                    </div>
                    {item.description && <p className="pc-desc">{item.description}</p>}
                    
                    <div className="pc-actions">
                      {qtyInCart > 0 ? (
                        <div className="qty-stepper active">
                          <button onClick={() => removeFromCart(item.id)}><FaMinus /></button>
                          <span>{qtyInCart}</span>
                          <button onClick={() => addToCart(item)}><FaPlus /></button>
                        </div>
                      ) : (
                        <button className="add-btn" onClick={() => addToCart(item)}>
                          Add <FaPlus style={{ fontSize: '10px', marginLeft: '4px' }}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Dynamic Floating Cart Button */}
      {cartCount > 0 && (
        <div className={`floating-cart-wrapper ${isCartOpen ? 'cart-hidden-state' : ''}`}>
          <button className="floating-cart-btn" onClick={() => setIsCartOpen(true)}>
            <div className="fcb-left">
              <div className="fcb-icon-wrap">
                <FaShoppingCart />
                <span className="fcb-badge">{cartCount}</span>
              </div>
              <div className="fcb-text">
                <span className="fcb-label">View Order</span>
                <span className="fcb-total">₹{cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="fcb-right">
              <FaArrowRight />
            </div>
          </button>
        </div>
      )}

      {/* Sliding Glass Drawer for Cart */}
      <div className={`cart-drawer-overlay ${isCartOpen ? 'open' : ''}`} onClick={() => setIsCartOpen(false)}>
        <div className="cart-drawer" onClick={e => e.stopPropagation()}>
          <div className="cd-drag-handle"></div>
          <div className="cd-header">
            <h2>Your Current Order</h2>
            <button className="cd-close" onClick={() => setIsCartOpen(false)}><FaTimes /></button>
          </div>
          
          <div className="cd-items">
            {cartItems.map(item => (
              <div key={item.id} className="cd-item">
                <div className="cdi-info">
                  <span className="cdi-name">{item.name}</span>
                  <span className="cdi-price">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
                <div className="qty-stepper active small">
                  <button onClick={() => removeFromCart(item.id)}><FaMinus /></button>
                  <span>{item.quantity}</span>
                  <button onClick={() => addToCart(item)}><FaPlus /></button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="cd-footer">
            <div className="cd-bill-row">
              <span>Item Total</span>
              <span>₹{cartTotal.toFixed(2)}</span>
            </div>
            <div className="cd-bill-row total">
              <span>Grand Total</span>
              <span>₹{cartTotal.toFixed(2)}</span>
            </div>

            {onlinePaymentEnabled && (
              <div className="payment-choice">
                <button
                  className={`pay-option ${selectedPayment === 'cash' ? 'active' : ''}`}
                  onClick={() => setSelectedPayment('cash')}
                  type="button"
                >
                  <FaUser />
                  <span>Pay at Counter</span>
                </button>
                <button
                  className={`pay-option ${selectedPayment === 'online' ? 'active' : ''}`}
                  onClick={() => setSelectedPayment('online')}
                  type="button"
                >
                  <FaMobileAlt />
                  <span>Pay Online</span>
                </button>
              </div>
            )}
             
            <button className="cd-checkout-btn" onClick={placeOrder} disabled={authLoading}>
              {authLoading ? 'Confirming...' : selectedPayment === 'online' ? `Pay ₹${cartTotal.toFixed(2)}` : 'Confirm Order to Kitchen'}
            </button>
          </div>
        </div>
      </div>

      {/* Order Success Modal */}
      {orderSuccess && (
        <div className="success-overlay">
          <div className="success-glass-card">
            <div className="sc-icon"><FaCheckCircle /></div>
            <h2>Order Sent!</h2>
            <p>Your order is confirmed and sent directly to the kitchen for Table {orderSuccess.tableNumber}.</p>
            <div className="sc-receipt">
              <div className="scr-row"><span>Order No:</span> <strong>{orderSuccess.orderNo}</strong></div>
              <div className="scr-row"><span>Status:</span> <strong style={{color: '#f59e0b'}}>{orderSuccess.status}</strong></div>
              <div className="scr-divider"></div>
              <div className="scr-row total"><span>Total:</span> <strong>₹{orderSuccess.grandTotal?.toFixed(2)}</strong></div>
            </div>
            <button className="sc-close-btn" onClick={() => setOrderSuccess(null)}>Order More Items</button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-msg ${toast.type}`} onClick={() => setToast(null)}>
          {toast.type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
          <span>{toast.msg}</span>
        </div>
      )}

      <style jsx>{`
        :global(body) { margin: 0; padding: 0; background: #0f172a; }
        .qr-container {
          min-height: 100dvh;
          width: 100%;
          background: #0f172a; /* Match the side color for a seamless look */
          font-family: 'Inter', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .qr-content-wrapper {
          width: 100%;
          max-width: min(100%, 500px); /* Default for mobile */
          background: #ffffff;
          min-height: 100dvh;
          margin: 0 auto;
          position: relative;
          display: flex;
          flex-direction: column;
          transition: max-width 0.3s ease;
        }

        @media (min-width: 768px) {
          .qr-content-wrapper { max-width: min(90%, 1100px); }
        }
        @media (min-width: 1200px) {
          .qr-content-wrapper { max-width: 1200px; }
        }

        /* Header */
        .qr-header {
          position: sticky;
          top: 0;
          z-index: 20;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(0,0,0,0.05);
          padding: calc(16px + env(safe-area-inset-top, 0px)) clamp(12px, 4vw, 20px) 0;
        }
        .qh-top-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; min-width: 0; }
        .qh-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .qh-logo-wrap { width: 44px; height: 44px; border-radius: 12px; background: white; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0; }
        .qh-logo-img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
        .qh-logo-fallback { font-size: 20px; font-weight: 800; color: var(--brand-color); }
        .qh-greeting { display: flex; flex-direction: column; min-width: 0; }
        .greet-text { font-size: 11px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1; margin-bottom: 2px; }
        .greet-name { font-size: 17px; font-weight: 900; color: #0f172a; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .qh-logout { background: #ffffff; border: 1px solid #f1f5f9; width: 40px; height: 40px; border-radius: 12px; color: #64748b; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
        .qh-logout:active { background: #fef2f2; color: #ef4444; border-color: #fee2e2; }

        .qh-search-wrap { position: relative; margin-bottom: 16px; }
        .qh-search-wrap .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .qh-search-wrap input { width: 100%; padding: 16px 20px 16px 46px; border: none; background: #ffffff; border-radius: 16px; font-size: 15px; font-family: inherit; font-weight: 500; color: #0f172a; box-shadow: 0 4px 15px rgba(0,0,0,0.03); outline: none; transition: 0.2s; box-sizing: border-box;}
        .qh-search-wrap input:focus { box-shadow: 0 4px 20px rgba(59,130,246,0.15); }

        .qh-categories { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 16px; scrollbar-width: none; }
        .qh-categories::-webkit-scrollbar { display: none; }
        .cat-tab { white-space: nowrap; padding: 10px 20px; border-radius: 100px; background: transparent; border: none; color: #64748b; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; position: relative; }
        .cat-tab.active { color: var(--brand-color); }
        .cat-tab.active::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 24px; height: 3px; background: var(--brand-color); border-radius: 3px; }

        /* Main Menu Content */
        .qr-main { padding: clamp(8px, 3vw, 32px); width: 100%; }
        .menu-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr)); gap: 10px; width: 100%; }
        
        @media (min-width: 768px) {
          .qr-main { padding: 32px; }
          .menu-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; }
          .qh-categories { justify-content: center; }
          .pc-cover { height: 140px; }
          .pc-title { font-size: 16px; }
          .pc-desc { font-size: 12px; }
        }

        @media (min-width: 1200px) {
          .menu-grid { grid-template-columns: repeat(4, 1fr); gap: 30px; }
          .pc-cover { height: 180px; }
        }

        /* DYNAMIC PRODUCT CARDS */
        .prod-card { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.03); position: relative; transition: transform 0.2s; border: 1px solid rgba(0,0,0,0.02); min-width: 0; }
        .prod-card:active { transform: scale(0.98); }

        .diet-indicator { position: absolute; top: 16px; left: 16px; width: 16px; height: 16px; border-radius: 4px; border: 2px solid; background: white; display: flex; align-items: center; justify-content: center; z-index: 2; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .diet-indicator::after { content: ''; width: 6px; height: 6px; border-radius: 50%; }
        .diet-indicator.veg { border-color: #10b981; } .diet-indicator.veg::after { background: #10b981; }
        .diet-indicator.non-veg { border-color: #ef4444; } .diet-indicator.non-veg::after { background: #ef4444; }

        /* Style A: Has Image (Cover Style) */
        .prod-card.has-image { display: flex; flex-direction: column; }
        .pc-cover { width: 100%; height: 80px; position: relative; background: #f1f5f9; }
        .pc-cover img { width: 100%; height: 100%; object-fit: cover; }
        .pc-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0) 60%, rgba(0,0,0,0.7) 100%); }
        .pc-price-tag { position: absolute; bottom: 4px; left: 8px; color: white; font-weight: 800; font-size: 12px; z-index: 2; text-shadow: 0 2px 4px rgba(0,0,0,0.5); }

        /* Style B: No Image (Compact Row Style) */
        .prod-card.no-image { display: flex; flex-direction: row; padding: 0; border-left: 4px solid transparent; }
        .prod-card.no-image:has(.diet-indicator.veg) { border-left-color: #10b981; }
        .prod-card.no-image:has(.diet-indicator.non-veg) { border-left-color: #ef4444; }
        .prod-card.no-image .diet-indicator { display: none; /* hidden because left border indicates it */ }
        .prod-card.no-image .pc-content { padding: 20px; width: 100%; min-width: 0; }
        .pc-price-text { font-weight: 800; color: var(--brand-color); font-size: 18px; margin-top: 4px; display: block; }

        .pc-content { padding: 8px; display: flex; flex-direction: column; flex: 1; }
        .pc-info { display: flex; justify-content: space-between; align-items: flex-start; }
        .pc-title { margin: 0; font-size: 12px; font-weight: 800; color: #0f172a; line-height: 1.1; overflow-wrap: anywhere; }
        .pc-desc { margin: 3px 0 0 0; font-size: 9px; color: #64748b; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1; min-height: 22px; }
        
        .pc-actions { display: flex; justify-content: flex-end; align-items: center; margin-top: 6px; }
        
        .add-btn { background: var(--brand-bg); color: var(--brand-color); border: none; padding: 3px 10px; border-radius: 100px; font-size: 10px; font-weight: 800; cursor: pointer; display: flex; align-items: center; transition: 0.2s; }
        .add-btn:active { background: var(--brand-color); color: white; }

        .qty-stepper { display: flex; align-items: center; background: var(--brand-color); border-radius: 100px; padding: 4px; color: white; box-shadow: 0 4px 12px var(--brand-glow); }
        .qty-stepper button { background: transparent; border: none; color: white; width: 36px; height: 32px; border-radius: 100px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; }
        .qty-stepper button:active { background: rgba(255,255,255,0.2); }
        .qty-stepper span { width: 24px; text-align: center; font-size: 15px; font-weight: 800; }
        .qty-stepper.small { background: #f1f5f9; color: #0f172a; box-shadow: none; }
        .qty-stepper.small button { color: #0f172a; width: 32px; height: 28px; }

        .empty-state { text-align: center; padding: 60px 20px; }
        .empty-circle { width: 80px; height: 80px; background: #e2e8f0; border-radius: 50%; margin: 0 auto 20px; position: relative; }
        .empty-state h3 { margin: 0 0 8px 0; color: #0f172a; font-size: 18px; font-weight: 800; }
        .empty-state p { margin: 0; color: #64748b; font-size: 14px; }

        .floating-cart-wrapper { 
          position: fixed; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
          width: min(92%, 500px); z-index: 10000;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .floating-cart-wrapper.cart-hidden-state { transform: translate(-50%, 200px); opacity: 0; pointer-events: none; }
        
        .floating-cart-btn { 
          width: 100%; background: var(--brand-color); color: white; border: none; 
          border-radius: 100px; padding: 16px clamp(16px, 4vw, 24px); display: flex; justify-content: space-between;
          align-items: center; cursor: pointer; 
          box-shadow: 0 15px 40px var(--brand-glow);
          border: 1px solid rgba(255,255,255,0.1);
        }
        @keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes bounceIn { 0% { transform: scale(0.9) translateY(40px); opacity: 0; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
        
        @media (min-width: 768px) {
          .floating-cart-wrapper { bottom: 40px; }
        }
        
        .fcb-left { display: flex; align-items: center; gap: 12px; }
        .fcb-icon-wrap { position: relative; font-size: 20px; color: white; display: flex; align-items: center; }
        .fcb-badge { position: absolute; top: -6px; right: -6px; background: #ef4444; color: white; font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 10px; border: 2px solid var(--brand-color); }
        .fcb-text { display: flex; flex-direction: column; align-items: flex-start; }
        .fcb-label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.5px; }
        .fcb-total { font-size: 16px; font-weight: 800; }
        .fcb-right { width: 32px; height: 32px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }

        /* Cart Drawer (Bottom Sheet / Side Panel) */
        .cart-drawer-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px); z-index: 50; opacity: 0; pointer-events: none; transition: opacity 0.3s; display: flex; align-items: flex-end; }
        .cart-drawer-overlay.open { opacity: 1; pointer-events: auto; }
        .cart-drawer { width: 100%; max-height: min(86dvh, 720px); background: white; border-radius: 28px 28px 0 0; display: flex; flex-direction: column; transform: translateY(100%); transition: transform 0.4s cubic-bezier(0.2, 1, 0.2, 1); box-shadow: 0 -20px 40px rgba(0,0,0,0.1); }
        .cart-drawer-overlay.open .cart-drawer { transform: translateY(0); }
        
        @media (min-width: 768px) {
          .cart-drawer-overlay { align-items: stretch; justify-content: flex-end; }
          .cart-drawer { width: min(450px, 100vw); max-height: 100dvh; height: 100dvh; border-radius: 32px 0 0 32px; transform: translateX(100%); }
          .cart-drawer-overlay.open .cart-drawer { transform: translateX(0); }
          .cd-drag-handle { display: none; }
          .cd-items { padding: 32px; }
          .cd-footer { padding: 32px; }
        }
        
        .cd-drag-handle { width: 40px; height: 4px; background: #cbd5e1; border-radius: 4px; margin: 12px auto 0; }
        .cd-header { padding: 20px clamp(16px, 5vw, 24px); display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #f1f5f9; }
        .cd-header h2 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
        .cd-close { background: #f1f5f9; border: none; width: 36px; height: 36px; border-radius: 50%; color: #64748b; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        
        .cd-items { padding: 20px clamp(16px, 5vw, 24px); overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; }
        .cd-item { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-width: 0; }
        .cdi-info { display: flex; flex-direction: column; min-width: 0; }
        .cdi-name { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px; overflow-wrap: anywhere; }
        .cdi-price { font-size: 14px; font-weight: 600; color: #64748b; }
        
        .cd-footer { padding: 24px clamp(16px, 5vw, 24px); background: #f8fafc; border-top: 1px solid #f1f5f9; border-radius: 0 0 0 0; padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
        .cd-bill-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #64748b; font-weight: 600; }
        .cd-bill-row.total { margin-top: 16px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 24px; }
        .payment-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .pay-option { border: 1px solid #e2e8f0; background: white; color: #64748b; border-radius: 16px; padding: 12px 10px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 800; cursor: pointer; }
        .pay-option.active { border-color: var(--brand-color); background: var(--brand-bg); color: var(--brand-color); box-shadow: 0 8px 18px var(--brand-glow); }
         
        .cd-checkout-btn { width: 100%; padding: 18px; border-radius: 20px; border: none; background: var(--brand-color); color: white; font-size: 16px; font-weight: 800; cursor: pointer; box-shadow: 0 10px 25px var(--brand-glow); transition: 0.2s; }
        .cd-checkout-btn:active { transform: scale(0.98); }
        .cd-checkout-btn:disabled { opacity: 0.7; }

        /* Success Overlay */
        .success-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .success-glass-card { background: white; border-radius: 20px; padding: 24px; text-align: center; max-width: 340px; width: 100%; animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        @keyframes popIn { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        
        .sc-icon { width: 56px; height: 56px; background: #dcfce7; color: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px; }
        .success-glass-card h2 { margin: 0 0 8px 0; font-size: 20px; font-weight: 800; color: #0f172a; }
        .success-glass-card p { margin: 0 0 20px 0; font-size: 13px; color: #64748b; line-height: 1.4; }
        
        .sc-receipt { background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px; text-align: left; border: 1px solid #f1f5f9; }
        .scr-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #64748b; }
        .scr-row strong { color: #0f172a; font-weight: 700; }
        .scr-divider { height: 1px; background: #f1f5f9; margin: 12px 0; }
        .scr-row.total { margin: 0; font-size: 16px; color: #0f172a; font-weight: 800; }
        
        .sc-close-btn { width: 100%; padding: 14px; background: var(--brand-color); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; }

        /* Custom Toast Notification */
        .toast-msg {
          position: fixed; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
          background: #1e293b; color: white; padding: 14px 24px; border-radius: 16px;
          display: flex; align-items: center; gap: 12px; z-index: 1000;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2); animation: toastPop .3s ease-out;
          cursor: pointer; min-width: min(280px, calc(100vw - 32px)); max-width: calc(100vw - 32px); font-weight: 600; font-size: 14px;
        }
        .toast-msg.error { background: #ef4444; }
        .toast-msg.success { background: #10b981; }
        @keyframes toastPop {
          from { transform: translate(-50%, 20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        @media (max-width: 360px) {
          .menu-grid { grid-template-columns: 1fr; }
          .payment-choice { grid-template-columns: 1fr; }
          .fcb-label { display: none; }
          .floating-cart-btn { border-radius: 18px; }
        }
      `}</style>
      </div> {/* End qr-content-wrapper */}
    </div>
  );
}
