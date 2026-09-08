import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import * as faceapi from 'face-api.js';
import { hrService } from '../../services/hrService';
import { FaClock, FaKeyboard, FaCamera, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

export default function AttendanceKiosk() {
  const videoRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [isFaceMode, setIsFaceMode] = useState(true);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [pin, setPin] = useState('');
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Clock tick
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Fetch employees for PIN mode dropdown and Face matching
    const fetchEmployees = async () => {
      try {
        const res = await hrService.getAllEmployees();
        setEmployees(res.data || []);
      } catch (e) {
        console.error("Failed to fetch employees", e);
      }
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (isFaceMode) {
      loadModels();
    } else {
      stopVideo();
    }
  }, [isFaceMode]);

  const loadModels = async () => {
    try {
      // NOTE: Models must be placed in public/models/ folder
      // Available at: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ]);
      setModelsLoaded(true);
      startVideo();
    } catch (e) {
      console.warn("Face models not found in /models. Falling back to PIN mode.", e);
      setIsFaceMode(false);
      setStatusMsg({ text: 'Facial recognition models missing. Use PIN entry.', type: 'error' });
    }
  };

  const startVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error("Camera error:", err);
        setIsFaceMode(false);
      });
  };

  const stopVideo = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const handleVideoPlay = () => {
    if (!isFaceMode) return;
    
    // Periodically detect face
    const interval = setInterval(async () => {
      if (videoRef.current && isFaceMode) {
        const detection = await faceapi.detectSingleFace(
          videoRef.current, 
          new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks().withFaceDescriptor();

        if (detection) {
          // In a real scenario, you'd match detection.descriptor against employee registered descriptors.
          // For this prototype, we'll simulate a match.
          handleClockIn('SIMULATED_ID', 'FACE_SCAN');
          clearInterval(interval);
        }
      }
    }, 2000);
  };

  const handlePunch = async (type) => {
    if (!selectedEmployee || !pin) {
      setStatusMsg({ text: 'Please select an employee and enter PIN', type: 'error' });
      return;
    }
    
    const emp = employees.find(e => e.id === selectedEmployee);
    if (emp && emp.pinCode && emp.pinCode !== pin) {
      setStatusMsg({ text: 'Invalid PIN entered. Please try again.', type: 'error' });
      return;
    }

    try {
      if (type === 'IN') {
        await hrService.clockIn({ 
          employeeId: selectedEmployee, 
          punchMethod: 'PIN' 
        });
        setStatusMsg({ text: `Success: ${emp ? emp.firstName : ''} Clocked In!`, type: 'success' });
      } else {
        await hrService.clockOut({ 
          employeeId: selectedEmployee 
        });
        setStatusMsg({ text: `Success: ${emp ? emp.firstName : ''} Clocked Out!`, type: 'success' });
      }
      
      setPin('');
      setSelectedEmployee('');
      
      setTimeout(() => {
        setStatusMsg({ text: '', type: '' });
      }, 5000);

    } catch (error) {
      setStatusMsg({ text: `Clock-${type.toLowerCase()} failed. Try again.`, type: 'error' });
    }
  };

  const handleClockIn = async (employeeId, method) => {
    try {
      // Hardcode SIMULATED_ID for face-scan demo to the first employee if exists
      const targetId = employeeId === 'SIMULATED_ID' 
        ? (employees.length > 0 ? employees[0].id : null) 
        : employeeId;
        
      if (!targetId) {
        setStatusMsg({ text: 'Employee not found.', type: 'error' });
        return;
      }

      await hrService.clockIn({ 
        employeeId: targetId, 
        punchMethod: method, 
        punchTime: new Date().toISOString()
      });
      
      const emp = employees.find(e => e.id === targetId);
      setStatusMsg({ text: `Success: ${emp ? emp.firstName : ''} Clocked In!`, type: 'success' });
      
      setPin('');
      setSelectedEmployee('');
      
      setTimeout(() => {
        setStatusMsg({ text: '', type: '' });
        if (isFaceMode) startVideo(); // Restart scanning after a delay
      }, 5000);

    } catch (error) {
      setStatusMsg({ text: 'Clock-in failed. Try again.', type: 'error' });
    }
  };

  return (
    <div className="kiosk-container">
      <Head>
        <title>Attendance Kiosk | Cafe QR</title>
      </Head>

      <div className="kiosk-header">
        <div className="logo-area">
          <img src="/logo.jpg" alt="Cafe QR Logo" />
          <h1>Staff Kiosk</h1>
        </div>
        <div className="clock-area">
          <div className="time">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="date">{currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      <div className="kiosk-body">
        <div className="mode-toggle">
          <button className={`toggle-btn ${isFaceMode ? 'active' : ''}`} onClick={() => setIsFaceMode(true)}>
            <FaCamera /> Face Scan
          </button>
          <button className={`toggle-btn ${!isFaceMode ? 'active' : ''}`} onClick={() => setIsFaceMode(false)}>
            <FaKeyboard /> PIN Entry
          </button>
        </div>

        {statusMsg.text && (
          <div className={`status-alert ${statusMsg.type}`}>
            {statusMsg.type === 'success' ? <FaCheckCircle /> : <FaExclamationTriangle />}
            {statusMsg.text}
          </div>
        )}

        <div className="kiosk-card glass-panel">
          {isFaceMode ? (
            <div className="face-scan-area">
              {!modelsLoaded ? (
                <div className="loading-models">Loading Facial Recognition AI...</div>
              ) : (
                <>
                  <div className="video-wrapper">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      muted 
                      onPlay={handleVideoPlay}
                      className="camera-feed"
                    />
                    <div className="scan-overlay"></div>
                  </div>
                  <h3>Look directly at the camera</h3>
                  <p>Position your face within the frame to clock in automatically.</p>
                </>
              )}
            </div>
          ) : (
            <div className="pin-entry-area">
              <h3>Manual Punch</h3>
              
              <div className="form-group">
                <label>Select Employee</label>
                <select 
                  value={selectedEmployee} 
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  required
                >
                  <option value="">-- Tap to Select --</option>
                  {employees.filter(emp => emp.isActive).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Enter 4-Digit PIN</label>
                <input 
                  type="password" 
                  maxLength="4"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="pin-input"
                  required
                />
              </div>

              <div className="action-buttons">
                <button type="button" className="btn-primary clock-in-btn" onClick={() => handlePunch('IN')}>
                  <FaClock /> Clock In
                </button>
                <button type="button" className="btn-secondary clock-out-btn" onClick={() => handlePunch('OUT')}>
                  <FaClock /> Clock Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .kiosk-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          display: flex; flex-direction: column;
          color: white; font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .kiosk-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 32px 48px;
        }
        
        .logo-area { display: flex; align-items: center; gap: 16px; }
        .logo-area img { width: 48px; height: 48px; border-radius: 12px; }
        .logo-area h1 { margin: 0; font-size: 24px; font-weight: 800; }

        .clock-area { text-align: right; }
        .clock-area .time { font-size: 48px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
        .clock-area .date { font-size: 16px; color: #94a3b8; font-weight: 600; margin-top: 4px; }

        .kiosk-body {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 24px;
        }

        .mode-toggle {
          display: flex; background: rgba(255, 255, 255, 0.1); border-radius: 16px;
          padding: 8px; gap: 8px; margin-bottom: 32px; backdrop-filter: blur(10px);
        }
        .toggle-btn {
          padding: 12px 24px; border-radius: 12px; border: none; background: transparent;
          color: #94a3b8; font-size: 16px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; gap: 8px; transition: all 0.3s;
        }
        .toggle-btn.active {
          background: #f97316; color: white; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
        }

        .glass-panel {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .kiosk-card { width: 100%; max-width: 500px; padding: 40px; }

        .face-scan-area { display: flex; flex-direction: column; align-items: center; text-align: center; }
        .video-wrapper {
          position: relative; width: 300px; height: 300px; border-radius: 50%;
          overflow: hidden; margin-bottom: 24px; border: 4px solid #334155;
          box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.2);
        }
        .camera-feed {
          width: 100%; height: 100%; object-fit: cover;
          transform: scaleX(-1); /* Mirror effect */
        }
        .scan-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, transparent 40%, rgba(249, 115, 22, 0.2) 50%, transparent 60%);
          background-size: 100% 200%;
          animation: scan 2s linear infinite;
        }
        @keyframes scan {
          0% { background-position: 0 -100%; }
          100% { background-position: 0 200%; }
        }
        
        .face-scan-area h3 { margin: 0 0 8px; font-size: 20px; }
        .face-scan-area p { margin: 0; color: #94a3b8; font-size: 14px; }
        
        .loading-models { padding: 40px; color: #f97316; font-weight: 700; font-size: 18px; }

        .pin-entry-area { display: flex; flex-direction: column; gap: 24px; }
        .pin-entry-area h3 { margin: 0; font-size: 24px; text-align: center; }
        
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { color: #94a3b8; font-size: 14px; font-weight: 600; text-transform: uppercase; }
        
        select, .pin-input {
          width: 100%; padding: 16px; border-radius: 12px;
          background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);
          color: white; font-size: 18px; outline: none; transition: all 0.2s;
        }
        select option { background: #1e293b; color: white; }
        .pin-input { text-align: center; font-size: 32px; letter-spacing: 12px; font-weight: 800; }
        select:focus, .pin-input:focus { border-color: #f97316; background: rgba(255, 255, 255, 0.15); }

        .action-buttons { display: flex; gap: 12px; }
        .btn-primary, .btn-secondary {
          flex: 1; padding: 16px; border-radius: 12px; border: none;
          color: white; font-size: 16px; font-weight: 800; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: transform 0.2s; box-shadow: 0 8px 16px rgba(0,0,0,0.2);
        }
        .btn-primary { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); }
        .btn-secondary { background: linear-gradient(135deg, #475569 0%, #334155 100%); }
        .btn-primary:hover, .btn-secondary:hover { transform: translateY(-2px); }

        .status-alert {
          position: absolute; top: 120px;
          padding: 16px 32px; border-radius: 100px;
          display: flex; align-items: center; gap: 12px;
          font-weight: 700; font-size: 16px; animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 100;
        }
        .status-alert.success { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .status-alert.error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

      `}</style>
    </div>
  );
}
