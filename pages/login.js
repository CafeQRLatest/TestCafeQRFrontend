import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { FaEye, FaEyeSlash, FaWhatsapp } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'
import { getApiUrl } from '../utils/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [msgType, setMsgType] = useState('error')
  const [landingUrl, setLandingUrl] = useState('https://cafeqr.in')
  
  // WhatsApp OTP Login States (Set to true to re-enable WhatsApp tab on POS login)
  const SHOW_WHATSAPP_LOGIN = false
  const [authMethod, setAuthMethod] = useState('PASSWORD') // 'PASSWORD' | 'WHATSAPP'
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  
  // Destructure isActive from useAuth
  const { login, isAuthenticated, isActive, subscriptionStatus } = useAuth()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase();
      if (hostname.includes('test') || hostname === 'localhost' || hostname === '127.0.0.1') {
        setLandingUrl('https://test-cafe-qr-landing.vercel.app/');
      } else {
        setLandingUrl('https://cafeqr.in');
      }
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      console.log('Login Page Redirect Check:', { isAuthenticated, isActive, subscriptionStatus });
      if (isActive) {
        router.push('/owner/main-menu');
      } else if (subscriptionStatus !== null) {
        // Only redirect to subscription if status has been explicitly set and is not active
        router.push('/subscription');
      }
    }
  }, [isAuthenticated, isActive, subscriptionStatus, router]);

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/auth/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Crucial for cross-origin cookies
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Login failed')
      
      // Fix: login expects the AuthResponse, which is in the 'data' field of ApiResponse
      login(data.data)
      setLoading(false)
    } catch (e) {
      setLoading(false)
      setMsgType('error')
      setMessage(e.message)
    }
  }

  // Handle Send WhatsApp OTP
  const handleSendWhatsAppOtp = async (e) => {
    if (e) e.preventDefault()
    const cleanPhone = phone.trim().replace(/[^0-9]/g, '')
    if (cleanPhone.length < 10) {
      setMsgType('error')
      setMessage('Please enter a valid 10-digit mobile number')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/auth/whatsapp/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Failed to send WhatsApp OTP')
      setOtpSent(true)
      setResendCooldown(30)
      setMsgType('success')
      setMessage('OTP sent to your WhatsApp!')
    } catch (err) {
      setMsgType('error')
      setMessage(err.message || 'Failed to send WhatsApp OTP')
    } finally {
      setLoading(false)
    }
  }

  // Handle Verify WhatsApp OTP
  const handleVerifyWhatsAppOtp = async (e) => {
    e.preventDefault()
    if (!otp.trim()) {
      setMsgType('error')
      setMessage('Please enter the 6-digit OTP')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const cleanPhone = phone.trim().replace(/[^0-9]/g, '')
      const response = await fetch(`${getApiUrl()}/api/v1/auth/whatsapp/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: cleanPhone, otp: otp.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Invalid or expired OTP')
      if (data.data?.exists && data.data?.auth) {
        login(data.data.auth)
      } else {
        setMsgType('error')
        setMessage('No account found with this phone. Please sign up first.')
      }
    } catch (err) {
      setMsgType('error')
      setMessage(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  return (
    <div className="page-wrapper">
      <div className="mobile-card">
        <div className="header-graphic">
          <div className="circle-overlay" />
          <div className="header-content">
            <div className="brand-logo">CafeQR</div>
            <h1>Sign In</h1>
            <p>Welcome back! Enter your details to manage your restaurant network.</p>
          </div>
        </div>

        <div className="form-body">
          {/* Method Selector Tabs - Set SHOW_WHATSAPP_LOGIN to true to re-enable WhatsApp OTP */}
          {SHOW_WHATSAPP_LOGIN && (
            <div className="method-tabs">
              <button
                type="button"
                className={`method-tab ${authMethod === 'PASSWORD' ? 'active' : ''}`}
                onClick={() => { setAuthMethod('PASSWORD'); setMessage(''); }}
              >
                Password Login
              </button>
              <button
                type="button"
                className={`method-tab ${authMethod === 'WHATSAPP' ? 'active' : ''}`}
                onClick={() => { setAuthMethod('WHATSAPP'); setMessage(''); }}
              >
                <FaWhatsapp style={{ color: '#25D366', fontSize: 16 }} />
                WhatsApp OTP
              </button>
            </div>
          )}

          {authMethod === 'PASSWORD' ? (
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@company.com"
                  disabled={loading}
                />
              </div>

              <div className="input-group">
                <label htmlFor="password">Password</label>
                <div className="pw-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    disabled={loading}
                  />
                  <button 
                    type="button" 
                    className="toggle-pw"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="forgot-link">
                <Link href="/forgot-password">Forgot Password?</Link>
              </div>

              {message && <div className={`alert ${msgType}`}>{message}</div>}

              <button type="submit" disabled={loading} className="submit-btn">
                {loading ? "SIGNING IN..." : "SIGN IN"}
              </button>

              <div className="signup-link">
                <p>Don&apos;t have an account? <a href={landingUrl} target="_blank" rel="noopener noreferrer">Buy POS Kit & Sign Up</a></p>
              </div>

              <div className="copyright-footer">
                &copy; 2026 CAFEQR POS. ALL RIGHTS RESERVED.
              </div>
            </form>
          ) : (
            /* WhatsApp OTP Login Form */
            <form onSubmit={otpSent ? handleVerifyWhatsAppOtp : handleSendWhatsAppOtp}>
              <div className="input-group">
                <label htmlFor="phone">Registered Mobile Number</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ 
                    padding: '14px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', 
                    borderRadius: 12, fontWeight: 700, fontSize: 14, color: '#475569', display: 'flex', alignItems: 'center' 
                  }}>+91</span>
                  <input
                    type="tel"
                    id="phone"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setMessage(''); }}
                    required
                    placeholder="e.g. 9496958200"
                    disabled={loading || otpSent}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  {otpSent && (
                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setOtp(''); setMessage(''); }}
                      style={{ background: 'none', border: 'none', color: '#f97316', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '0 8px' }}
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>

              {otpSent && (
                <div className="input-group">
                  <label htmlFor="otp">6-Digit WhatsApp OTP</label>
                  <input
                    type="text"
                    id="otp"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value); setMessage(''); }}
                    required
                    placeholder="Enter code"
                    disabled={loading}
                    autoFocus
                    style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || loading}
                      onClick={handleSendWhatsAppOtp}
                      style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? '#94a3b8' : '#115e59', fontWeight: 700, fontSize: 12, cursor: resendCooldown > 0 ? 'default' : 'pointer' }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                    </button>
                  </div>
                </div>
              )}

              {message && <div className={`alert ${msgType}`}>{message}</div>}

              <button type="submit" disabled={loading} className="submit-btn">
                {loading 
                  ? (otpSent ? "VERIFYING..." : "SENDING OTP...") 
                  : (otpSent ? "VERIFY & SIGN IN" : "CONTINUE WITH WHATSAPP")}
              </button>

              <div className="signup-link">
                <p>Don&apos;t have an account? <a href={landingUrl} target="_blank" rel="noopener noreferrer">Buy POS Kit & Sign Up</a></p>
              </div>

              <div className="copyright-footer">
                &copy; 2026 CAFEQR POS. ALL RIGHTS RESERVED.
              </div>
            </form>
          )}
        </div>
      </div>

      <style jsx global>{`
        body { background: #f8fafc; margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b; }
      `}</style>

      <style jsx>{`
        .page-wrapper {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 20px; background: #f1f5f9;
        }
        .mobile-card {
           width: 100%; max-width: 1000px; height: 600px;
           background: white; border-radius: 32px;
           overflow: hidden; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.1);
           display: flex;
        }
        .header-graphic {
          width: 45%; height: 100%;
          background: #f97316;
          position: relative; overflow: hidden;
          color: white;
        }
        .circle-overlay {
          position: absolute; top: -100px; right: -100px;
          width: 300px; height: 300px;
          background: #115e59; border-radius: 50%;
        }
        .header-content {
          position: relative; z-index: 2; padding: 60px; height: 100%;
          display: flex; flex-direction: column; justify-content: center;
        }
        .brand-logo { font-size: 24px; font-weight: 800; margin-bottom: 24px; letter-spacing: -1px; }
        .header-content h1 { font-size: 40px; margin: 0 0 16px; font-weight: 800; line-height: 1.1; }
        .header-content p { font-size: 16px; opacity: 0.9; line-height: 1.6; }

        .form-body {
          flex: 1; padding: 60px;
          display: flex; flex-direction: column; justify-content: center;
        }
        form { width: 100%; max-width: 360px; margin: 0 auto; }
        .input-group { margin-bottom: 24px; display: flex; flex-direction: column; gap: 8px; }
        .input-group label {
          font-size: 12px; font-weight: 700; color: #115e59; 
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .input-group input {
           display: block; width: 100%;
           padding: 14px 16px;
           font-family: inherit;
           font-size: 15px; font-weight: 600;
           border: 1px solid #e2e8f0; border-radius: 12px;
           background: #f8fafc; color: #1e293b;
           outline: none; transition: all 0.2s;
        }
        .input-group input:focus { border-color: #f97316; background: white; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); }
        .pw-wrapper { position: relative; width: 100%; }
        .toggle-pw { 
          position: absolute; right: 14px; top: 14px; 
          background: none; border: none; color: #94a3b8; 
          cursor: pointer; font-size: 18px; display: flex; align-items: center;
        }
        .toggle-pw:hover { color: #f97316; }
        .forgot-link { text-align: right; margin-bottom: 32px; margin-top: -12px; }
        .forgot-link a { font-size: 14px; color: #475569; text-decoration: none; font-weight: 600; }
        .forgot-link a:hover { color: #f97316; text-decoration: underline; }

        .method-tabs {
          display: flex; gap: 8px; margin: 0 auto 28px; width: 100%; max-width: 360px;
          background: #f1f5f9; padding: 4px; border-radius: 14px;
        }
        .method-tab {
          flex: 1; padding: 10px 12px; border: none; border-radius: 10px;
          font-size: 13px; font-weight: 700; color: #64748b; background: transparent;
          cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .method-tab.active {
          background: white; color: #0f172a; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        .alert { 
          padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 600;
          margin-bottom: 24px;
        }
        .alert.error { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
        .alert.success { background: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; }

        .submit-btn {
          width: 100%;
          padding: 16px;
          background: #115e59;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 10px 20px -5px rgba(17, 94, 89, 0.3);
        }
        .submit-btn:hover:not(:disabled) {
          background: #0d4a46;
          transform: translateY(-2px);
          box-shadow: 0 15px 30px -5px rgba(17, 94, 89, 0.4);
        }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .signup-link { text-align: center; margin-top: 32px; font-size: 14px; color: #475569; }
        .signup-link :global(a) { color: #115e59; text-decoration: none; font-weight: 700; margin-left: 4px; }
        .signup-link :global(a):hover { text-decoration: underline; color: #0f4b47; }
        
        .copyright-footer { 
          text-align: center; margin-top: 48px; 
          font-size: 11px; color: #94a3b8; font-weight: 700;
          letter-spacing: 1px;
        }

        @media (max-width: 1024px) {
           .mobile-card { max-width: 480px; flex-direction: column; height: auto; border-radius: 0; }
           .header-graphic { width: 100%; height: 280px; border-bottom-left-radius: 32px; border-bottom-right-radius: 32px; }
           .header-content { padding: 40px; }
           .header-content h1 { font-size: 32px; }
           .form-body { padding: 40px 24px; }
           .page-wrapper { padding: 0; align-items: flex-start; background: white; }
        }
      `}</style>
    </div>
  )
}
