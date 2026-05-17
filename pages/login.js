import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [msgType, setMsgType] = useState('error')
  
  // Destructure isActive from useAuth
  const { login, isAuthenticated, isActive, subscriptionStatus } = useAuth()

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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Crucial for cross-origin cookies
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Login failed')
      
      // Fix: login expects the AuthResponse, which is in the 'data' field of ApiResponse
      console.log('Login Response Data:', data.data);
      login(data.data)
      setLoading(false)
    } catch (e) {
      setLoading(false)
      setMsgType('error')
      setMessage(e.message)
    }
  }

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
              <p>Don&apos;t have an account? <Link href="/signup">Sign Up</Link></p>
            </div>

            <div className="copyright-footer">
              &copy; 2026 CAFEQR POS. ALL RIGHTS RESERVED.
            </div>
          </form>
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

        .submit-btn {
          width: 100%; padding: 16px;
          background: #115e59; color: white;
          border: none; border-radius: 12px;
          font-size: 15px; font-weight: 700;
          cursor: pointer; transition: all 0.2s;
          box-shadow: 0 10px 20px -5px rgba(17, 94, 89, 0.3);
        }
        .submit-btn:hover { background: #0f4b47; transform: translateY(-2px); }
        .submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .alert { 
          padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 600;
          margin-bottom: 24px;
        }
        .alert.error { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
        .alert.success { background: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; }

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
