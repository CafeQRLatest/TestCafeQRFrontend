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
    clientId
  } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      setError(null)
      const response = await api.get('/api/v1/subscription/status')
      const data = response.data?.data
      if (data) {
        setStatus(data)
        updateSubscription(data.status, data.expiryDate)
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

  const handlePayment = async () => {
    setLoading(true)
    setError(null)

    try {
      await loadRazorpayScript()
      const response = await api.post('/api/v1/subscription/create-payment')
      const payment = response.data?.data

      if (!payment?.orderId || !payment?.keyId) {
        throw new Error('Invalid payment order returned by server')
      }

      // Check if running in Capacitor/Android WebView to support UPI Intent
      const isAndroidApp = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.getPlatform() === 'android';

      const options = {
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency || 'INR',
        name: 'CafeQR Subscription',
        description: payment.description || 'Monthly Subscription - Rs 99',
        order_id: payment.orderId,
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
        // WebView UPI Intent requirements
        options.webview_intent = true
        options.redirect = true
        const frontendUrl = window.location.origin + '/subscription'
        options.callback_url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/subscription/razorpay-callback-redirect/${clientId}?frontend_url=${encodeURIComponent(frontendUrl)}`
      } else {
        // Standard Web handler
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
              updateSubscription(activated.status, activated.expiryDate)
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
  const daysLeft = status?.daysLeft
  const statusLabel = currentStatus === 'TRIAL' ? 'Free Trial Active' : active ? 'Pro Plan Active' : 'Subscription Expired'

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

                {Number.isFinite(daysLeft) && (
                  <div className="info-row compact">
                    <FaCheckCircle className="icon" />
                    <div className="text">
                      <label>Days Remaining</label>
                      <span>{daysLeft} days</span>
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

            <section className="pricing-panel">
              <div className="glass-card pricing-card featured">
                <div className="card-top">
                  <div className="plan-name">BUSINESS PRO</div>
                  <div className="price-tag">
                    <span className="currency">₹</span>
                    <span className="val">99</span>
                    <span className="cycle">/ month</span>
                  </div>
                </div>

                <ul className="perks-list">
                  <li><FaCheckCircle className="check" /> Unlimited Digital Ordering</li>
                  <li><FaCheckCircle className="check" /> Professional QR Menu Studio</li>
                  <li><FaCheckCircle className="check" /> Advanced Business Analytics</li>
                  <li><FaCheckCircle className="check" /> Multi-device KDS Support</li>
                  <li><FaCheckCircle className="check" /> GST & Tax Compliance Tools</li>
                  <li><FaCheckCircle className="check" /> 24/7 Priority Assistance</li>
                </ul>

                <button
                  className={`action-btn ${loading ? 'loading' : ''}`}
                  onClick={handlePayment}
                  disabled={loading}
                >
                  {loading ? 'PROCESSING...' : active ? 'RENEW SUBSCRIPTION' : 'ACTIVATE PRO NOW'}
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
          .subscription-wrapper { min-height: calc(100vh - 120px); color: #1e293b; }
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

          .action-btn {
             width: 100%; padding: 20px; background: #f97316; color: white; border: none; border-radius: 16px;
             font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.2s;
             box-shadow: 0 10px 20px rgba(249, 115, 22, 0.2);
          }
          .action-btn:hover { background: #ea580c; box-shadow: 0 15px 30px rgba(249, 115, 22, 0.3); transform: translateY(-2px); }
          .action-btn.loading { opacity: 0.7; cursor: wait; transform: none; }

          .card-notes { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; }
          .error-box { margin-top: 18px; padding: 14px; border-radius: 14px; background: #fef2f2; color: #dc2626; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; }

          @keyframes blink { 50% { opacity: 0.6; } }

          @media (max-width: 900px) {
             .sub-layout { grid-template-columns: 1fr; }
             .perks-list { grid-template-columns: 1fr; }
             h1 { font-size: 32px; }
          }
          @media (max-width: 640px) {
             .page-header { text-align: center; }
             .pricing-card { padding: 32px 24px; }
             .val { font-size: 52px; }
          }
          @media (max-width: 480px) {
             .module-item { flex-direction: column; align-items: flex-start; gap: 10px; }
             .module-price { text-align: left; min-width: auto; }
             .builder-card { padding: 16px 12px; }
             h1 { font-size: 26px; }
             .container { padding: 0 8px; }
          }
        `}</style>
      </div>
    </DashboardLayout>
  )
}
