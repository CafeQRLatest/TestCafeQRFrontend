import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { email } = router.query;
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

  // Timer logic
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timerId = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timerId);
  }, [timeLeft]);

  // Auto-focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (e, index) => {
    const value = e.target.value;
    if (isNaN(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0 && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').replace(/\D/g, '').substring(0, 6);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);

    const focusIndex = pastedData.length < 6 ? pastedData.length : 5;
    if (inputRefs.current[focusIndex]) {
      inputRefs.current[focusIndex].focus();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const token = otp.join('');
    
    if (token.length !== 6) {
      setStatus('error');
      setMessage('Please enter all 6 digits.');
      return;
    }

    setStatus('loading');
    setMessage('Verifying your code...');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/verify?token=${token}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        setStatus('success');
        setMessage('Email verified! You can now log in.');
      } else {
        let errorMsg = 'Invalid verification code.';
        try {
          const data = await response.json();
          if (data.message) errorMsg = data.message;
        } catch (e) {
          const textData = await response.text();
          if (textData) errorMsg = textData;
        }
        throw new Error(errorMsg);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setStatus('error');
      setMessage('No email address found to resend to.');
      return;
    }

    setStatus('loading');
    setMessage('Sending new code...');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/resend?email=${encodeURIComponent(email)}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        setStatus('idle');
        setMessage('A new code has been sent!');
        setTimeLeft(60); 
        setOtp(['', '', '', '', '', '']);
        if (inputRefs.current[0]) inputRefs.current[0].focus();
      } else {
        const textData = await response.text();
        throw new Error(textData || 'Failed to resend code');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="mobile-card">
        {/* Header Graphic (Green Theme) */}
        <div className="header-graphic">
          <div className="circle-overlay" />
          <div className="header-content">
            <button className="back-btn" onClick={() => router.push('/signup')}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <h1>Verify<br />Email</h1>
          </div>
        </div>

        {/* Form Body */}
        <div className="form-body">
          <div className="content-container">
            
            {(status === 'idle' || status === 'loading') && (
              <div className="status-box">
                <h2>Enter your Code</h2>
                <p className="subtitle">
                  {message === 'A new code has been sent!' ? (
                    <span style={{color: '#15803d', fontWeight: 600}}>{message}</span>
                  ) : (
                    <>We sent a 6-digit code to <strong>{email || 'your email'}</strong></>
                  )}
                </p>
                
                <form onSubmit={handleVerify}>
                  <div className="otp-container" onPaste={handlePaste}>
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        ref={(el) => (inputRefs.current[index] = el)}
                        onChange={(e) => handleChange(e, index)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className={`otp-input ${digit ? 'filled' : ''}`}
                        disabled={status === 'loading'}
                      />
                    ))}
                  </div>

                  {status === 'error' && <p className="error-text">{message}</p>}

                  <button 
                    type="submit" 
                    className="submit-btn" 
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div className="spinner-small" /> {message}
                      </div>
                    ) : 'VERIFY CODE'}
                  </button>

                  <div className="resend-container">
                    <p>Didn&apos;t receive the code?</p>
                    <button 
                      type="button" 
                      onClick={handleResend} 
                      disabled={timeLeft > 0 || status === 'loading' || !email}
                      className="resend-text-btn"
                    >
                      {timeLeft > 0 ? `Resend Code in ${timeLeft}s` : 'Resend Code'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {status === 'success' && (
              <div className="status-box success">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <h2>Account Verified!</h2>
                <p className="subtitle" style={{marginBottom: '20px'}}>{message}</p>
                <button className="submit-btn" onClick={() => router.push('/login')}>
                  CONTINUE TO LOGIN
                </button>
              </div>
            )}

            {status === 'error' && (
              <div className="status-box error">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <h2>Verification Failed</h2>
                <p className="error-text" style={{marginTop: '10px'}}>{message}</p>
                
                <button className="submit-btn" style={{marginTop: '20px'}} onClick={() => {setStatus('idle'); setMessage(''); setOtp(['', '', '', '', '', '']);}}>
                  TRY AGAIN
                </button>
              </div>
            )}

            <div className="copyright-footer">
              &copy; 2026 ALL RIGHTS RESERVED
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        body { background: #e2e8f0; margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
      `}</style>

      <style jsx>{`
        .page-wrapper {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: #cbd5e1; padding: 20px;
        }

        .mobile-card {
           width: 100%; max-width: 950px; height: 650px;
           background: white; border-radius: 32px;
           overflow: hidden; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.2);
           display: flex; flex-direction: row;
        }

        /* HEADER */
        .header-graphic {
          width: 45%; height: 100%;
          background: #115e59;
          position: relative; overflow: hidden;
        }
        .circle-overlay {
          position: absolute; top: -100px; right: -100px;
          width: 320px; height: 320px;
          background: #f97316; border-radius: 50%;
        }
        .header-content {
          position: relative; z-index: 2; padding: 60px 40px; height: 100%;
          display: flex; flex-direction: column; justify-content: center;
        }
        .header-content h1 { font-size: 48px; margin: 0; color: white; line-height: 1.1; font-weight: 800; }
        .back-btn {
          position: absolute; top: 30px; left: 30px;
          background: transparent; border: none; padding: 0; cursor: pointer;
        }

        /* BODY */
        .form-body {
          flex: 1; padding: 60px;
          display: flex; flex-direction: column; justify-content: center;
          background: white;
        }
        .content-container { width: 100%; max-width: 400px; margin: 0 auto; text-align: center; }

        /* STATUS BOXES */
        .status-box {
          display: flex; flex-direction: column; align-items: center; width: 100%;
        }
        .status-box.success { padding: 30px; border-radius: 20px; background: #f0fdf4; border: 1px solid #dcfce7; }
        .status-box.error { padding: 30px; border-radius: 20px; background: #fef2f2; border: 1px solid #fee2e2; }
        
        .status-box h2 { color: #1e293b; font-size: 28px; margin: 0 0 5px 0; font-weight: 800; }
        .status-box.success h2 { color: #15803d; margin-top: 15px;}
        .status-box.error h2 { color: #991b1b; margin-top: 15px;}
        
        .subtitle { color: #64748b; font-size: 15px; margin: 0 0 30px 0; }
        .error-text { color: #ef4444; font-size: 14px; font-weight: 600; margin: 15px 0 0 0; }

        /* OTP INPUTS */
        .otp-container {
          display: flex; justify-content: space-between; gap: 8px; width: 100%; margin-bottom: 20px;
        }
        .otp-input {
          width: calc(100% / 6 - 8px); height: 60px;
          font-size: 24px; font-weight: 800; text-align: center;
          color: #1e293b; background: #f8fafc;
          border: 2px solid #e2e8f0; border-radius: 12px;
          transition: all 0.2s; outline: none; box-shadow: 0 2px 4px rgba(0,0,0,0.02) inset;
        }
        .otp-input:focus { border-color: #115e59; background: white; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(17,94,89,0.1); }
        .otp-input.filled { border-color: #cbd5e1; background: white; }

        /* SPINNER */
        .spinner-small {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white;
          border-radius: 50%; animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* BUTTONS */
        .submit-btn {
           width: 100%; padding: 16px; margin-top: 10px;
           background: #115e59; color: white;
           border: none; border-radius: 12px;
           font-size: 14px; font-weight: 700;
           letter-spacing: 1px; cursor: pointer; text-transform: uppercase;
           box-shadow: 0 10px 20px -5px rgba(17, 94, 89, 0.3);
           transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
        }
        .submit-btn:hover:not(:disabled) { 
           transform: translateY(-2px);
           box-shadow: 0 15px 30px -5px rgba(17, 94, 89, 0.5);
        }
        .submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .resend-container {
           margin-top: 25px;
           font-size: 14px; color: #64748b;
        }
        .resend-container p { margin: 0 0 5px 0; }
        .resend-text-btn {
           background: transparent; border: none; padding: 0;
           color: #115e59; font-weight: 700; font-size: 14px; cursor: pointer;
           text-decoration: underline; text-underline-offset: 4px;
        }
        .resend-text-btn:disabled {
           color: #94a3b8; text-decoration: none; cursor: not-allowed;
        }

        .copyright-footer {
          text-align: center; margin-top: 50px; font-size: 12px;
          color: #94a3b8; letter-spacing: 1px; font-weight: 500;
        }

        /* MOBILE */
        @media (max-width: 900px) {
           .page-wrapper { padding: 0; align-items: flex-start; background: #fff; }
           .mobile-card {
              flex-direction: column; height: 100%; min-height: 100vh;
              max-width: none; border-radius: 0; box-shadow: none;
           }
           .header-graphic {
              width: 100%; height: 280px; flex: none;
              border-bottom-left-radius: 50px; border-bottom-right-radius: 50px;
           }
           .circle-overlay { top: -60px; right: -60px; width: 220px; height: 220px; }
           .header-content { justify-content: flex-start; padding-top: 60px; }
           .header-content h1 { font-size: 36px; }
           .form-body { padding: 40px 30px; justify-content: flex-start; }
           .content-container { max-width: none; margin: 0; }
           .otp-input { height: 50px; font-size: 20px; }
        }
      `}</style>
    </div>
  );
}
