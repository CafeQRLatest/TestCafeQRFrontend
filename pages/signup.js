import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { FaEye, FaEyeSlash, FaShieldAlt, FaUtensils, FaGlobe, FaArrowLeft } from 'react-icons/fa'
import NiceSelect from '../components/NiceSelect'
import api from '../utils/api'

const COUNTRY_OPTIONS = [
  { label: 'India', value: 'IN' },
  { label: 'United Arab Emirates', value: 'AE' },
  { label: 'Saudi Arabia', value: 'SA' },
  { label: 'Qatar', value: 'QA' },
  { label: 'Oman', value: 'OM' },
  { label: 'Kuwait', value: 'KW' },
  { label: 'Bahrain', value: 'BH' },
  { label: 'United States', value: 'US' },
  { label: 'United Kingdom', value: 'GB' },
  { label: 'Australia', value: 'AU' },
  { label: 'Canada', value: 'CA' },
  { label: 'Singapore', value: 'SG' },
  { label: 'Malaysia', value: 'MY' },
  { label: 'Germany', value: 'DE' },
  { label: 'France', value: 'FR' },
  { label: 'Italy', value: 'IT' },
  { label: 'Spain', value: 'ES' },
  { label: 'Netherlands', value: 'NL' },
  { label: 'Switzerland', value: 'CH' },
  { label: 'Japan', value: 'JP' },
  { label: 'South Korea', value: 'KR' },
  { label: 'China', value: 'CN' },
  { label: 'Brazil', value: 'BR' },
  { label: 'South Africa', value: 'ZA' },
  { label: 'New Zealand', value: 'NZ' },
  { label: 'Russia', value: 'RU' },
  { label: 'Mexico', value: 'MX' },
  { label: 'Turkey', value: 'TR' },
  { label: 'Indonesia', value: 'ID' },
  { label: 'Thailand', value: 'TH' },
  { label: 'Vietnam', value: 'VN' },
  { label: 'Philippines', value: 'PH' },
  { label: 'Pakistan', value: 'PK' },
  { label: 'Bangladesh', value: 'BD' },
  { label: 'Sri Lanka', value: 'LK' },
  { label: 'Nepal', value: 'NP' },
  { label: 'Others', value: 'OTHERS' }
];

const POS_OPTIONS = [
  { label: 'Restaurant', value: 'RESTAURANT' },
  { label: 'Cafe & Bistro', value: 'CAFE' },
  { label: 'QSR (Quick Service)', value: 'QSR' },
  { label: 'Bakery & Pastry', value: 'BAKERY' },
  { label: 'Boutique & Fashion', value: 'BOUTIQUE' },
  { label: 'Grocery & Supermarket', value: 'GROCERY' },
  { label: 'Salon & Spa', value: 'SALON' },
  { label: 'Food Truck', value: 'FOOD_TRUCK' },
  { label: 'Bar / Pub', value: 'BAR' },
  { label: 'Others / Retail', value: 'OTHERS' }
];

export default function SignupPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [country, setCountry] = useState('')
  const [posType, setPosType] = useState('RESTAURANT')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [msgType, setMsgType] = useState(""); 
  const [otpSent, setOtpSent] = useState(false)
  const [otpFields, setOtpFields] = useState(['', '', '', '', '', ''])
  const [showPassword, setShowPassword] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newFields = [...otpFields];
    newFields[index] = value.substring(value.length - 1);
    setOtpFields(newFields);
    if (value && index < 5) {
        document.getElementById(`otp-${index + 1}`)?.focus();
    }
  }

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpFields[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  }

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault()
    if (password !== confirmPassword) {
      setMsgType("error");
      setMessage('Passwords do not match')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const response = await api.post('/api/v1/auth/send-otp', { email });
      setOtpSent(true);
      setResendTimer(60);
      setMsgType("success");
      setMessage('Verification code sent.');
    } catch (err) {
      setMsgType("error");
      setMessage(err.response?.data?.message || err.message || 'Failed to send OTP');
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e) => {
    if (e) e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const response = await api.post('/api/v1/auth/register', { 
         firstName: fullName.split(' ')[0] || '', 
         lastName: fullName.split(' ').slice(1).join(' ') || '.', 
         email, password, country, posType,
         otp: otpFields.join('')
      });
      setMsgType("success");
      setMessage('Success! Redirecting...');
      setTimeout(() => router.push('/login?registered=true'), 1500);
    } catch (err) {
      setMsgType("error");
      setMessage(err.response?.data?.message || err.message || 'Signup failed');
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrapper">
      <div className="auth-card">
        {/* Left Side: Brand & Visuals (Matching Login Style) */}
        <div className="visual-panel">
          <div className="circle-overlay" />
          <div className="visual-content">
             <button className="back-btn" onClick={() => otpSent ? setOtpSent(false) : router.push('/login')}>
                <FaArrowLeft />
             </button>
             <div className="brand">CafeQR</div>
             <h1>{otpSent ? 'Almost\nThere' : 'Create\nAccount'}</h1>
             <p>{otpSent ? 'One last step to secure your workspace.' : 'Enter your details to get started with our POS network.'}</p>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="form-panel">
          <div className="form-container">
            <form onSubmit={otpSent ? handleSignup : handleSendOtp}>
                {!otpSent ? (
                <div className="form-grid">
                    <div className="field-group">
                        <label>FULL NAME</label>
                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="e.g. John Doe" disabled={loading} />
                    </div>

                    <div className="field-group">
                        <label>EMAIL ADDRESS</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" disabled={loading} />
                    </div>

                    <div className="select-row">
                        <div className="field-group">
                            <label><FaGlobe /> COUNTRY</label>
                            <NiceSelect options={COUNTRY_OPTIONS} value={country} onChange={setCountry} placeholder="Select" />
                        </div>
                        <div className="field-group">
                            <label><FaUtensils /> BUSINESS</label>
                            <NiceSelect options={POS_OPTIONS} value={posType} onChange={setPosType} />
                        </div>
                    </div>

                    <div className="field-group">
                        <label>PASSWORD</label>
                        <div className="pw-wrap">
                            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" disabled={loading} />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        </div>
                    </div>

                    <div className="field-group">
                        <label>CONFIRM PASSWORD</label>
                        <div className="pw-wrap">
                            <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder="••••••••" disabled={loading} />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        </div>
                    </div>
                </div>
                ) : (
                <div className="otp-step">
                    <div className="otp-icon"><FaShieldAlt /></div>
                    <p>Enter the code sent to<br/><strong>{email}</strong></p>
                    <div className="otp-grid">
                    {otpFields.map((digit, i) => (
                        <input key={i} id={`otp-${i}`} type="text" maxLength={1} value={digit} onChange={e => handleOtpChange(i, e.target.value)} onKeyDown={e => handleOtpKeyDown(i, e)} autoComplete="one-time-code" />
                    ))}
                    </div>
                    <div className="resend-cta">
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : <span onClick={handleSendOtp}>Send code again</span>}
                    </div>
                </div>
                )}

                {message && <div className={`status-alert ${msgType}`}>{message}</div>}

                <button type="submit" disabled={loading} className="submit-btn">
                {loading ? 'Processing...' : (otpSent ? 'CREATE ACCOUNT' : 'SEND SECURITY CODE')}
                </button>
                
                <div className="login-link">
                Already have an account? <Link href="/login">Sign In</Link>
                </div>

                <div className="footer-cr">
                &copy; 2026 CAFEQR. ALL RIGHTS RESERVED
                </div>
            </form>
          </div>
        </div>
      </div>

      <style jsx global>{`
        body { background: #f1f5f9; margin: 0; font-family: 'Inter', sans-serif; color: #1e293b; }
      `}</style>

      <style jsx>{`
        .page-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .auth-card { 
            width: 100%; max-width: 1000px; display: flex; background: white; 
            border-radius: 32px; overflow: hidden; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.12);
            min-height: 680px;
        }

        /* Visual Panel (Matching Login Style) */
        .visual-panel { 
            width: 42%; background: #f97316; /* Orange Base */
            position: relative; overflow: hidden; color: white;
            display: flex; flex-direction: column; justify-content: center; padding: 60px;
        }
        .circle-overlay { 
            position: absolute; top: -100px; right: -100px; 
            width: 320px; height: 320px; background: #115e59; /* Teal Circle */
            border-radius: 50%; opacity: 1; 
        }
        .visual-content { position: relative; z-index: 2; }
        .back-btn { background: none; border: none; color: white; cursor: pointer; font-size: 20px; display: flex; align-items: center; margin-bottom: 30px; padding: 0; }
        .brand { font-size: 22px; font-weight: 900; letter-spacing: -1px; margin-bottom: 20px; }
        .visual-panel h1 { font-size: 48px; font-weight: 800; line-height: 1.1; margin: 0 0 20px; color: white; white-space: pre-line; }
        .visual-panel p { font-size: 16px; line-height: 1.6; opacity: 0.9; }

        /* Form Panel */
        .form-panel { flex: 1; padding: 60px; display: flex; align-items: center; justify-content: center; }
        .form-container { width: 100%; max-width: 440px; }
        
        .form-grid { display: flex; flex-direction: column; gap: 20px; }
        .field-group { display: flex; flex-direction: column; gap: 8px; }
        .field-group label { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; }
        .field-group input { 
            width: 100%; padding: 12px 14px; font-size: 15px; font-weight: 500; 
            border: 1px solid #e2e8f0; border-radius: 10px; background: #fff;
            color: #1e293b; outline: none; transition: 0.2s;
        }
        .field-group input:focus { border-color: #115e59; background: #f0fdfa; }
        
        .select-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        
        .pw-wrap { position: relative; }
        .pw-wrap button { position: absolute; right: 12px; top: 12px; background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; }

        .otp-step { text-align: center; }
        .otp-icon { font-size: 40px; color: #115e59; margin-bottom: 16px; opacity: 0.9; }
        .otp-step p { font-size: 15px; color: #64748b; line-height: 1.6; margin-bottom: 32px; }
        .otp-grid { display: flex; gap: 12px; justify-content: center; margin-bottom: 24px; }
        .otp-grid input { 
            width: 45px; height: 56px; text-align: center; font-size: 24px; font-weight: 800; color: #115e59;
            background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; outline: none; transition: 0.2s;
        }
        .otp-grid input:focus { border-color: #f97316; background: white; transform: translateY(-2px); }
        .resend-cta { font-size: 14px; color: #94a3b8; font-weight: 600; }
        .resend-cta span { color: #f97316; cursor: pointer; text-decoration: underline; }

        .status-alert { padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; margin-top: 24px; text-align: center; }
        .status-alert.error { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
        .status-alert.success { background: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; }

        .submit-btn { 
            width: 100%; padding: 16px; background: #115e59; color: white; border: none; border-radius: 12px;
            font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 32px; transition: 0.2s;
            box-shadow: 0 10px 20px -5px rgba(17, 94, 89, 0.3);
        }
        .submit-btn:hover { background: #0d4a46; transform: translateY(-2px); }
        .submit-btn:disabled { opacity: 0.6; cursor: wait; }

        .login-link { text-align: center; margin-top: 32px; font-size: 14px; font-weight: 600; color: #64748b; }
        .login-link :global(a) { color: #115e59; text-decoration: none; font-weight: 800; margin-left: 4px; }
        .login-link :global(a):hover { text-decoration: underline; color: #0f4b47; }
        
        .footer-cr { text-align: center; margin-top: 40px; font-size: 11px; color: #cbd5e1; font-weight: 700; letter-spacing: 1px; }

        @media (max-width: 1024px) {
            .auth-card { flex-direction: column; max-width: 480px; height: auto; border-radius: 0; }
            .visual-panel { width: 100%; min-height: 280px; padding: 40px; border-bottom-left-radius: 32px; border-bottom-right-radius: 32px; }
            .visual-panel h1 { font-size: 36px; }
            .form-panel { padding: 40px 24px; }
            .page-wrapper { padding: 0; align-items: flex-start; background: white; }
            .form-container { padding: 0 10px; }
        }
      `}</style>
    </div>
  )
}
