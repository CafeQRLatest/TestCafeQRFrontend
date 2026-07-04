import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../context/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import api from '../utils/api'
import { formatTzDate } from '../utils/timezoneUtils'
import { FaCheckCircle, FaCrown, FaRocket, FaHeadset, FaCalendarCheck, FaExclamationCircle } from 'react-icons/fa'

const loadRazorpayScript = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined') return reject(new Error('Browser checkout is unavailable'))
  if (window.Razorpay) return resolve(true)

  const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')
  if (existingScript) {
    existingScript.addEventListener('load', () => resolve(true), { once: true })
    existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout')), { once: true })
    return
  }

  const script = document.createElement('script')
  script.src = 'https://checkout.razorpay.com/v1/checkout.js'
  script.async = true
  script.onload = () => resolve(true)
  script.onerror = () => reject(new Error('Failed to load Razorpay checkout'))
  document.body.appendChild(script)
})

export default function SubscriptionPage() {
  const {
    isActive,
    subscriptionStatus,
    normalizedExpiryDate,
    isAuthenticated,
    loading: authLoading,
    email,
    fullName,
    clientName,
    updateSubscription,
    timezone,
    clientId,
    orgId
  } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  // Configurator plan selection states
  const [includeBasePlan, setIncludeBasePlan] = useState(true)
  const [includeSetupService, setIncludeSetupService] = useState(false)
  
  // Add-on modules selection state
  const [selectedModules, setSelectedModules] = useState([])

  const moduleItems = [
    { id: 'KOT', name: 'Kitchen Order Ticket (KOT) Sachet', price: 499, desc: 'Send orders instantly to kitchen screens. Branch-wide access.' },
    { id: 'INVENTORY', name: 'Inventory & Purchase ERP Sachet', price: 1999, desc: 'Stock valuation, transfers, supplier orders, and waste logging. Branch-wide access.' },
    { id: 'CRM', name: 'Customer CRM & Loyalty Sachet', price: 999, desc: 'Track customer visits, loyalty points, and run sms campaigns. Client-wide access.' },
    { id: 'CREDIT_LEDGER', name: 'Credit Ledger (Udhaar) Sachet', price: 499, desc: 'Keep track of digital tabs and credit customers. Client-wide access.' }
  ]

  const fetchStatus = useCallback(async () => {
    try {
      setError(null)
      const response = await api.get('/api/v1/subscription/status')
      const data = response.data?.data
      if (data) {
        setStatus(data)
        updateSubscription(data.status, data.expiryDate, data.activeModules)
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Unable to load subscription status')
    }
  }, [updateSubscription])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, authLoading, router])

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus()
    }
  }, [isAuthenticated, fetchStatus])

  // If the user already has an active base subscription, default includeBasePlan to false for upgrades
  const isPaidOrTrial = (status?.status || subscriptionStatus) === 'ACTIVE' || (status?.status || subscriptionStatus) === 'TRIAL'
  const isExpired = !isPaidOrTrial || (status && !status.active)
  const isSubscribed = status?.active && status?.status === 'ACTIVE'

  useEffect(() => {
    if (status) {
      if (status.active && status.status === 'ACTIVE') {
        setIncludeSetupService(false)
        setIncludeBasePlan(false) // Default false so active users don't pay base plan again by default
      } else {
        setIncludeSetupService(true)
        setIncludeBasePlan(true) // Default true for new/expired clients
      }
    }
  }, [status])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const statusParam = params.get('status')
      const paymentId = params.get('payment_id')
      const errorMsg = params.get('message')

      if (statusParam === 'success') {
        alert('Payment successful. Your subscription is active.')
        router.replace('/subscription', undefined, { shallow: true })
        fetchStatus()
      } else if (statusParam === 'error') {
        setError(errorMsg || 'Payment failed. Please try again.')
        router.replace('/subscription', undefined, { shallow: true })
      }
    }
  }, [router, fetchStatus])

  const toggleModule = (id) => {
    setSelectedModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  const handlePayment = async () => {
    setLoading(true)
    setError(null)

    try {
      await loadRazorpayScript()
      // Call create-payment specifically for the base core plan (selected or forced) + setup fee + add-on modules
      const response = await api.post('/api/v1/subscription/create-payment', {
        includeBasePlan: includeBasePlan,
        includeSetupService: isSubscribed ? false : includeSetupService,
        selectedModules: selectedModules,
        orgId
      })
      console.log('[Subscription Checkout] Response:', response.data)
      const payment = response.data?.data

      if (!payment) {
        throw new Error('No payment data returned by server')
      }

      const orderId = payment.orderId || payment.order_id
      const keyId = payment.keyId || payment.key_id

      if (!orderId || !keyId) {
        console.error('[Subscription Checkout] Missing fields in payment object:', payment)
        throw new Error('Invalid payment order returned by server (missing orderId or keyId)')
      }

      // Check if running in Capacitor/Android WebView to support UPI Intent
      const isAndroidApp = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.getPlatform() === 'android';

      const options = {
        key: keyId,
        amount: payment.amount,
        currency: payment.currency || 'INR',
        name: 'CafeQR Subscription',
        description: payment.description || 'Yearly Subscription - Rs 999',
        order_id: orderId,
        prefill: {
          name: fullName || clientName || 'CafeQR User',
          email: email || ''
        },
        theme: { color: '#f97316' },
        modal: {
          ondismiss: () => setLoading(false)
        }
      }

      if (isAndroidApp) {
        options.webview_intent = true
        options.redirect = true
        const frontendUrl = window.location.origin + '/subscription'
        options.callback_url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/subscription/razorpay-callback-redirect/${clientId}?frontend_url=${encodeURIComponent(frontendUrl)}`
      } else {
        options.handler = async (razorpayResponse) => {
          try {
            const activateResponse = await api.post('/api/v1/subscription/activate', {
              razorpayOrderId: razorpayResponse.razorpay_order_id,
              razorpayPaymentId: razorpayResponse.razorpay_payment_id,
              razorpaySignature: razorpayResponse.razorpay_signature
            })
            const activated = activateResponse.data?.data
            if (activated) {
              setStatus(activated)
              updateSubscription(activated.status, activated.expiryDate, activated.activeModules)
            }
            alert('Payment successful. Your subscription is active.')
            router.replace('/dashboard')
          } catch (err) {
            setError(err.response?.data?.message || 'Payment succeeded, but subscription activation failed. Please contact support.')
          } finally {
            setLoading(false)
          }
        }
      }

      const checkout = new window.Razorpay(options)
      checkout.open()
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Payment failed')
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="loader-screen">
        <div className="spinner"></div>
      </div>
    )
  }

  const active = status ? status.active : isActive
  const currentStatus = (status?.status || subscriptionStatus || '').toUpperCase()
  const expiryDate = status?.expiryDate ? new Date(status.expiryDate) : normalizedExpiryDate
  const daysLeft = status?.daysLeft || 0
  const statusLabel = currentStatus === 'TRIAL' ? 'Free Trial Active' : active ? 'Pro Plan Active' : 'Subscription Expired'

  const basePrice = includeBasePlan ? 999 : 0
  const setupPrice = (isSubscribed || !includeSetupService) ? 0 : 1499
  
  // Calculate module proration if it is a mid-cycle upgrade
  const calculateModuleCost = (modulePrice) => {
    if (isSubscribed && !includeBasePlan) {
      // Prorate cost based on remaining days left in year
      return Math.max(1, Math.round((modulePrice / 365.0) * daysLeft))
    }
    return modulePrice
  }

  const modulesTotalCost = selectedModules.reduce((sum, id) => {
    const item = moduleItems.find(m => m.id === id)
    return sum + (item ? calculateModuleCost(item.price) : 0)
  }, 0)

  const grandTotalCost = basePrice + setupPrice + modulesTotalCost

  // Filter modules that are NOT yet bought by this user
  const visibleModules = moduleItems.filter(
    item => !(status?.status === 'ACTIVE' && status?.activeModules?.includes(item.id))
  )

  return (
    <DashboardLayout title="Subscription">
      <div className="subscription-wrapper">
        <div className="container">
          <header className="page-header">
            <span className="premium-label"><FaCrown /> BILLING CENTER</span>
            <h1>Manage Subscription</h1>
            <p>Transparency and performance for your professional restaurant operations.</p>
          </header>

          <main className="sub-layout">
            {/* Left status panel */}
            <section className="status-panel">
              <div className="glass-card status-card">
                <h3>Service Status</h3>
                <div className={`status-indicator ${active ? 'active' : 'expired'}`}>
                  <span className="pulse-dot"></span>
                  {statusLabel}
                </div>

                <div className="info-row">
                  <FaCalendarCheck className="icon" />
                  <div className="text">
                    <label>Valid Until</label>
                    <span>{expiryDate ? formatTzDate(expiryDate, timezone, { format: 'date', long: true }) : 'N/A'}</span>
                  </div>
                </div>

                {Number.isFinite(daysLeft) && active && (
                  <div className="info-row compact">
                    <FaCheckCircle className="icon" />
                    <div className="text">
                      <label>Days Remaining</label>
                      <span>{daysLeft} days</span>
                    </div>
                  </div>
                )}

                {status?.activeModules && status.activeModules.length > 0 && (
                  <div className="active-modules-list">
                    <label className="sidebar-label">Active Modules</label>
                    <div className="active-modules-badges">
                      {status.activeModules.map(modId => {
                        const matched = moduleItems.find(m => m.id === modId)
                        return (
                          <span key={modId} className="active-mod-badge">
                            {matched ? matched.name.replace(' Sachet', '') : modId}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="highlight-box">
                  <FaRocket className="rocket" />
                  <span>Priority Cloud Server Access Enabled</span>
                </div>
              </div>

              <div className="support-card">
                <p>Questions about billing?</p>
                <a href="mailto:pnriyas50@gmail.com"><FaHeadset /> Reach Support</a>
              </div>
            </section>

            {/* Right featured plan panel */}
            <section className="pricing-panel">
              <div className="glass-card pricing-card featured">
                <div className="card-top">
                  <div className="plan-name">
                    {isSubscribed ? 'UPGRADE ADD-ON MODULES' : 'CAFE QR CORE LICENSE'}
                  </div>
                  <div className="price-tag">
                    <span className="currency">₹</span>
                    <span className="val">{isSubscribed ? grandTotalCost : '999'}</span>
                    <span className="cycle">{isSubscribed ? 'total' : '/ year'}</span>
                  </div>
                </div>

                {/* Show Core features list ONLY if they are not yet subscribed */}
                {!isSubscribed && (
                  <ul className="perks-list">
                    <li><FaCheckCircle className="check" /> Unlimited Digital Ordering Menu</li>
                    <li><FaCheckCircle className="check" /> Live Staff Dashboard & Reports</li>
                    <li><FaCheckCircle className="check" /> Advanced POS Sales & Business Analytics</li>
                    <li><FaCheckCircle className="check" /> Table QR Ordering & Billing Tools</li>
                    <li><FaCheckCircle className="check" /> GST & Tax Compliance Invoicing</li>
                    <li><FaCheckCircle className="check" /> 24/7 Priority System Assistance</li>
                  </ul>
                )}

                {/* Optional Service Charge Checkbox */}
                {!isSubscribed && (
                  <div className={`setup-checkbox-wrapper ${includeSetupService ? 'selected' : ''}`} onClick={() => setIncludeSetupService(!includeSetupService)}>
                    <input 
                      type="checkbox"
                      checked={includeSetupService}
                      readOnly
                    />
                    <label>
                      <strong>Include Setup & Onboarding Assistance</strong>
                      <span>One-time assistance fee (+ ₹1,499)</span>
                    </label>
                  </div>
                )}

                {/* Renewal option for active subscribed users - only show if expiring soon (<= 30 days) */}
                {isSubscribed && daysLeft <= 30 && (
                  <div className={`setup-checkbox-wrapper ${includeBasePlan ? 'selected' : ''}`} onClick={() => setIncludeBasePlan(!includeBasePlan)}>
                    <input 
                      type="checkbox"
                      checked={includeBasePlan}
                      readOnly
                    />
                    <label>
                      <strong>Renew Cafe QR Core License</strong>
                      <span>Extend active subscription by 1 year (+ ₹999/year)</span>
                    </label>
                  </div>
                )}

                {visibleModules.length > 0 && (
                  <div className="divider-title">Explore Add-on Modules</div>
                )}

                {/* Sachet Add-ons Checkboxes: Only show modules not yet purchased */}
                {visibleModules.map(item => {
                  const isModuleBought = status?.status === 'ACTIVE' && status?.activeModules?.includes(item.id)
                  const cost = calculateModuleCost(item.price)
                  const isProrated = active && !includeSetupService

                  return (
                    <div 
                      key={item.id}
                      className={`setup-checkbox-wrapper ${selectedModules.includes(item.id) || isModuleBought ? 'selected' : ''} ${isModuleBought ? 'disabled' : ''}`}
                      onClick={() => {
                        if (!isModuleBought) {
                          toggleModule(item.id)
                        }
                      }}
                      style={{ cursor: isModuleBought ? 'not-allowed' : 'pointer' }}
                    >
                      <input 
                        type="checkbox"
                        checked={selectedModules.includes(item.id) || isModuleBought}
                        readOnly
                        disabled={isModuleBought}
                      />
                      <label>
                        <strong>{item.name.replace(' Sachet', '')}</strong>
                        <span>
                          {isModuleBought ? 'Currently Active' : `+ ₹${cost} ${isProrated ? `for ${daysLeft} days` : '/ year'}`} — {item.desc}
                        </span>
                      </label>
                    </div>
                  )
                })}

                {/* Show clean message if all add-ons are active */}
                {isSubscribed && visibleModules.length === 0 && (
                  <div className="fully-upgraded-message">
                    <FaCheckCircle className="check-icon" />
                    <span>Your Cafe QR Suite is fully upgraded! All available modules are active.</span>
                  </div>
                )}

                {/* Order Summary receipt breakdown */}
                {(includeBasePlan || includeSetupService || selectedModules.length > 0) && (
                  <div className="receipt-box">
                    <div className="receipt-title">Order Summary</div>
                    {includeBasePlan && (
                      <div className="receipt-row">
                        <span>Base Core Plan {isSubscribed && 'Renewal'}</span>
                        <span>₹999</span>
                      </div>
                    )}
                    {(!isSubscribed && includeSetupService) && (
                      <div className="receipt-row">
                        <span>Menu Setup Fee</span>
                        <span>₹1,499</span>
                      </div>
                    )}
                    {selectedModules.length > 0 && selectedModules.map(modId => {
                      const item = moduleItems.find(m => m.id === modId)
                      if (!item) return null
                      const cost = calculateModuleCost(item.price)
                      return (
                        <div key={modId} className="receipt-row itemized">
                          <span>+ {item.name.replace(' Sachet', '')}</span>
                          <span>₹{cost}</span>
                        </div>
                      )
                    })}
                    <div className="receipt-row total-row" style={{ paddingTop: '10px', marginTop: '10px', borderTop: '1px dashed #cbd5e1', fontWeight: '800', color: '#0f172a' }}>
                      <span>Total Amount</span>
                      <span>₹{grandTotalCost}</span>
                    </div>
                  </div>
                )}

                <button
                  className={`action-btn ${loading ? 'loading' : ''}`}
                  onClick={handlePayment}
                  disabled={loading || (isSubscribed && !includeBasePlan && selectedModules.length === 0)}
                >
                  {loading ? 'PROCESSING...' : includeBasePlan ? 'RENEW SUBSCRIPTION' : isSubscribed ? 'BUY ADD-ONS' : active ? 'RENEW SUBSCRIPTION' : 'ACTIVATE PRO NOW'}
                </button>

                <div className="card-notes">
                  <svg width="80" height="20" viewBox="0 0 100 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.5 12.5C14.5 15.5376 12.0376 18 9 18C5.96243 18 3.5 15.5376 3.5 12.5C3.5 9.46243 5.96243 7 9 7C12.0376 7 14.5 9.46243 14.5 12.5Z" fill="#115e59" />
                    <text x="20" y="18" fill="#525252" style={{ fontSize: '12px', fontWeight: '900', fontFamily: 'Plus Jakarta Sans' }}>RAZORPAY</text>
                  </svg>
                  <span>SECURE 128-BIT ENCRYPTED PAYMENTS</span>
                </div>

                {error && (
                  <div className="error-box">
                    <FaExclamationCircle />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>

        <style jsx>{`
          .subscription-wrapper { min-height: calc(100vh - 120px); color: #1e293b; background: #f8fafc; padding: 40px 20px; }
          .container { max-width: 1120px; margin: 0 auto; }

          .page-header { text-align: left; margin-bottom: 32px; }
          .premium-label {
             display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800;
             color: #f97316; background: #fff7ed; padding: 6px 14px; border-radius: 100px; border: 1px solid #ffedd5;
             letter-spacing: 1px; margin-bottom: 22px;
          }

          h1 { font-size: 40px; font-weight: 800; margin: 0 0 12px; letter-spacing: -1px; color: #0f172a; }
          .page-header p { font-size: 17px; color: #64748b; margin: 0; }

          .sub-layout { display: grid; grid-template-columns: 340px 1fr; gap: 40px; align-items: start; }
          .glass-card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }

          .status-card { padding: 32px; display: flex; flex-direction: column; gap: 24px; }
          .status-card h3 { font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin: 0; }

          .status-indicator { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; }
          .pulse-dot { width: 8px; height: 8px; border-radius: 50%; }
          .active .pulse-dot { background: #10b981; box-shadow: 0 0 10px #10b981; animation: blink 2s infinite; }
          .expired .pulse-dot { background: #ef4444; }

          .info-row { display: flex; align-items: center; gap: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
          .info-row.compact { padding-top: 0; border-top: 0; }
          .info-row .icon { font-size: 20px; color: #cbd5e1; }
          .info-row label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 2px; text-transform: uppercase; }
          .info-row span { font-size: 15px; font-weight: 700; color: #1e293b; }

          .active-modules-list { margin-top: 10px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
          .sidebar-label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 10px; text-transform: uppercase; }
          .active-modules-badges { display: flex; flex-wrap: wrap; gap: 6px; }
          .active-mod-badge { 
            font-size: 11px; 
            font-weight: 700; 
            color: #10b981; 
            background: #ecfdf5; 
            border: 1px solid #a7f3d0; 
            padding: 4px 10px; 
            border-radius: 6px; 
          }

          .highlight-box { background: #f8fafc; padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 600; color: #10b981; }
          .rocket { font-size: 16px; }

          .support-card { text-align: center; margin-top: 24px; }
          .support-card p { font-size: 14px; color: #64748b; margin-bottom: 8px; }
          .support-card a { color: #f97316; font-weight: 700; text-decoration: none; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; }

          .pricing-card { padding: 48px; border: 2px solid #e2e8f0; position: relative; }
          .pricing-card.featured { border-color: #f97316; }

          .plan-name { font-size: 12px; font-weight: 800; color: #f97316; letter-spacing: 2px; margin-bottom: 12px; }
          .price-tag { display: flex; align-items: baseline; gap: 4px; }
          .currency { font-size: 28px; font-weight: 600; color: #94a3b8; }
          .val { font-size: 64px; font-weight: 900; letter-spacing: 0; color: #0f172a; }
          .cycle { font-size: 18px; color: #94a3b8; font-weight: 600; }

          .perks-list { list-style: none; padding: 0; margin: 40px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .perks-list li { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: #475569; }
          .check { color: #10b981; font-size: 16px; }

          .setup-checkbox-wrapper {
             display: flex;
             align-items: flex-start;
             gap: 14px;
             background: #f8fafc;
             border: 1px solid #e2e8f0;
             border-radius: 14px;
             padding: 16px 20px;
             margin: 12px 0;
             cursor: pointer;
             text-align: left;
             transition: all 0.25s ease;
          }
          .setup-checkbox-wrapper:hover {
             border-color: #cbd5e1;
             background: #f1f5f9;
             transform: translateY(-1px);
          }
          .setup-checkbox-wrapper.selected {
             background: #fffdfa;
             border-color: #f97316;
             box-shadow: 0 4px 20px rgba(249, 115, 22, 0.06);
          }
          .setup-checkbox-wrapper.disabled {
             opacity: 0.65;
             background: #fafafa;
             cursor: not-allowed;
          }
          .setup-checkbox-wrapper.disabled:hover {
             transform: none;
             border-color: #e2e8f0;
             background: #fafafa;
          }
          .setup-checkbox-wrapper input[type="checkbox"] {
             appearance: none;
             -webkit-appearance: none;
             width: 20px;
             height: 20px;
             border: 1.5px solid #cbd5e1;
             border-radius: 6px;
             background: white;
             display: inline-flex;
             align-items: center;
             justify-content: center;
             cursor: pointer;
             position: relative;
             transition: all 0.2s ease;
             outline: none;
             margin: 2px 0 0;
             flex-shrink: 0;
          }
          .setup-checkbox-wrapper input[type="checkbox"]:checked {
             background: #f97316;
             border-color: #f97316;
          }
          .setup-checkbox-wrapper input[type="checkbox"]:checked::after {
             content: '✓';
             color: white;
             font-size: 13px;
             font-weight: bold;
          }
          .setup-checkbox-wrapper label {
             display: flex;
             flex-direction: column;
             gap: 2px;
             cursor: pointer;
             user-select: none;
          }
          .setup-checkbox-wrapper label strong {
             font-size: 14px;
             color: #0f172a;
             font-weight: 700;
          }
          .setup-checkbox-wrapper label span {
             font-size: 11.5px;
             color: #64748b;
             line-height: 1.35;
          }
          
          .divider-title {
             font-size: 10px;
             font-weight: 800;
             color: #94a3b8;
             text-transform: uppercase;
             margin-top: 24px;
             margin-bottom: 12px;
             letter-spacing: 0.5px;
             text-align: left;
          }

          .fully-upgraded-message {
             padding: 20px;
             background: #ecfdf5;
             border: 1px solid #a7f3d0;
             border-radius: 14px;
             color: #047857;
             font-size: 13px;
             font-weight: 700;
             display: flex;
             align-items: center;
             gap: 10px;
             margin: 24px 0;
             text-align: left;
          }
          .fully-upgraded-message .check-icon {
             font-size: 16px;
             flex-shrink: 0;
          }

          /* Receipt inside card style */
          .receipt-box {
            background: #f8fafc;
            border-radius: 12px;
            border: 1px dashed #e2e8f0;
            padding: 16px;
            margin: 24px 0;
            text-align: left;
          }
          .receipt-title {
            font-size: 10px;
            font-weight: 800;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
          }
          .receipt-row {
            display: flex;
            justify-content: space-between;
            font-size: 12.5px;
            color: #475569;
            font-weight: 600;
            margin-bottom: 8px;
          }
          .receipt-row.itemized {
            color: #64748b;
            padding-left: 8px;
            font-size: 12px;
          }
          .receipt-row:last-child {
            margin-bottom: 0;
          }

          .action-btn {
             width: 100%; padding: 20px; background: #f97316; color: white; border: none; border-radius: 16px;
             font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.2s;
             box-shadow: 0 10px 20px rgba(249, 115, 22, 0.2);
          }
          .action-btn:hover { background: #ea580c; box-shadow: 0 15px 30px rgba(249, 115, 22, 0.3); transform: translateY(-2px); }
          .action-btn:disabled { opacity: 0.65; cursor: not-allowed; background: #cbd5e1; box-shadow: none; transform: none; }
          .action-btn.loading { opacity: 0.7; cursor: wait; transform: none; }

          .card-notes { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; }
          .error-box { margin-top: 18px; padding: 14px; border-radius: 14px; background: #fef2f2; color: #dc2626; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; }

          @keyframes blink { 50% { opacity: 0.6; } }

          @media (max-width: 900px) {
             .sub-layout { grid-template-columns: 1fr; }
             .perks-list { grid-template-columns: 1fr; }
          }
          @media (max-width: 640px) {
             .page-header { text-align: center; }
             .pricing-card { padding: 32px 24px; }
          }
        `}</style>
      </div>
    </DashboardLayout>
  )
}
