import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaTimes, FaRedo, FaCheckCircle } from 'react-icons/fa';
import { findProductByBarcode } from '../domain/products';

/**
 * CameraBarcodeScannerModal
 * 
 * Opens the device camera and scans 1D/2D barcodes using:
 *   - Native BarcodeDetector API (Chrome 83+, Android WebView 83+) — Zero dependencies
 * 
 * On successful scan, looks up the barcode in the local product list,
 * adds the product to cart, and closes the modal.
 */
export default function CameraBarcodeScannerModal({
  open,
  onClose,
  products,
  addToCart,
  notify,
  themeColor = '#10b981'
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // rear camera
  const lastScannedRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleBarcodeDetected = useCallback(async (rawValue) => {
    const code = String(rawValue || '').trim();
    if (!code) return;

    // Prevent duplicate scans of the same barcode within 2 seconds
    const prev = lastScannedRef.current;
    if (prev && prev.code === code && (Date.now() - prev.time) < 2000) {
      return;
    }

    const scanEntry = { code, time: Date.now() };
    lastScannedRef.current = scanEntry;

    // Look up in local product memory
    const product = findProductByBarcode(products, code);

    if (product) {
      // Success beep using Web Audio API
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1800, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        }
      } catch (e) { /* ignore audio errors */ }

      setLastScanned({ ...scanEntry, productName: product.name });
      await addToCart(product);
      if (notify) notify('success', `Scanned: ${product.name}`);

      // Auto-close after a brief success flash
      setTimeout(() => {
        stopCamera();
        onClose();
      }, 600);
    } else {
      // Not found — show inline message, keep scanning
      setLastScanned({ ...scanEntry, notFound: true });
      if (notify) notify('warning', `No product found for barcode: ${code}`);
    }
  }, [products, addToCart, notify, stopCamera, onClose]);

  const startCamera = useCallback(async () => {
    setError(null);
    setLastScanned(null);
    lastScannedRef.current = null;

    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScanning(true);

      // Use native BarcodeDetector if available (Chrome 83+, Android WebView 83+)
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code']
        });

        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              handleBarcodeDetected(barcodes[0].rawValue);
            }
          } catch (e) {
            // Ignore per-frame detection errors
          }
        }, 250); // Scan 4 times per second
      } else {
        setError('Your device does not support the BarcodeDetector API. Please use a USB/Bluetooth scanner or type the barcode manually.');
      }
    } catch (err) {
      console.error('[CameraScanner] Camera access error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in your device settings and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError(`Camera error: ${err.message}`);
      }
    }
  }, [facingMode, handleBarcodeDetected]);

  // Start camera when modal opens
  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCamera = useCallback(() => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, [stopCamera]);

  // Re-start camera when facingMode changes
  useEffect(() => {
    if (open && !scanning) {
      const timer = setTimeout(() => startCamera(), 300);
      return () => clearTimeout(timer);
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <>
      <div className="camera-scanner-overlay" onClick={() => { stopCamera(); onClose(); }}>
        <div className="camera-scanner-modal" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="camera-scanner-header">
            <h3>📷 Scan Barcode</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="camera-scanner-icon-btn" onClick={toggleCamera} title="Switch Camera">
                <FaRedo size={14} />
              </button>
              <button className="camera-scanner-icon-btn close" onClick={() => { stopCamera(); onClose(); }} title="Close">
                <FaTimes size={16} />
              </button>
            </div>
          </div>

          {/* Camera Viewport */}
          <div className="camera-scanner-viewport">
            <video
              ref={videoRef}
              className="camera-scanner-video"
              playsInline
              muted
              autoPlay
            />

            {/* Scanning Overlay Crosshair */}
            {scanning && (
              <div className="camera-scanner-crosshair">
                <div className="crosshair-corner tl" />
                <div className="crosshair-corner tr" />
                <div className="crosshair-corner bl" />
                <div className="crosshair-corner br" />
                <div className="scanning-line" />
              </div>
            )}

            {/* Last Scanned Result */}
            {lastScanned && (
              <div className={`camera-scanner-result ${lastScanned.notFound ? 'not-found' : 'found'}`}>
                {lastScanned.notFound ? (
                  <>❌ No product for: <strong>{lastScanned.code}</strong></>
                ) : (
                  <><FaCheckCircle /> Added: <strong>{lastScanned.productName}</strong></>
                )}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="camera-scanner-error">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="camera-scanner-footer">
            Point camera at barcode · Auto-detects EAN-13, UPC, Code-128, QR
          </div>
        </div>
      </div>

      <style jsx>{`
        .camera-scanner-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(6px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: csFadeIn 0.2s ease;
        }
        @keyframes csFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .camera-scanner-modal {
          background: #0f172a;
          border-radius: 20px;
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: csSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes csSlideUp {
          from { transform: translateY(30px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .camera-scanner-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
        }
        .camera-scanner-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
        }
        .camera-scanner-icon-btn {
          background: #334155;
          border: none;
          border-radius: 10px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }
        .camera-scanner-icon-btn:hover {
          background: #475569;
          color: #f1f5f9;
        }
        .camera-scanner-icon-btn.close:hover {
          background: #ef4444;
          color: white;
        }
        .camera-scanner-viewport {
          position: relative;
          width: 100%;
          aspect-ratio: 4 / 3;
          background: #000;
          overflow: hidden;
        }
        .camera-scanner-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .camera-scanner-crosshair {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .crosshair-corner {
          position: absolute;
          width: 36px;
          height: 36px;
          border-color: ${themeColor};
          border-style: solid;
          border-width: 0;
        }
        .crosshair-corner.tl {
          top: 18%; left: 12%;
          border-top-width: 3px; border-left-width: 3px;
          border-top-left-radius: 10px;
        }
        .crosshair-corner.tr {
          top: 18%; right: 12%;
          border-top-width: 3px; border-right-width: 3px;
          border-top-right-radius: 10px;
        }
        .crosshair-corner.bl {
          bottom: 18%; left: 12%;
          border-bottom-width: 3px; border-left-width: 3px;
          border-bottom-left-radius: 10px;
        }
        .crosshair-corner.br {
          bottom: 18%; right: 12%;
          border-bottom-width: 3px; border-right-width: 3px;
          border-bottom-right-radius: 10px;
        }
        .scanning-line {
          position: absolute;
          left: 12%; right: 12%;
          height: 2px;
          background: ${themeColor};
          box-shadow: 0 0 12px ${themeColor};
          animation: csScanLine 2s ease-in-out infinite;
        }
        @keyframes csScanLine {
          0%, 100% { top: 22%; }
          50% { top: 78%; }
        }
        .camera-scanner-result {
          position: absolute;
          bottom: 12px; left: 12px; right: 12px;
          padding: 10px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: csFadeIn 0.2s ease;
        }
        .camera-scanner-result.found {
          background: rgba(16, 185, 129, 0.9);
          color: white;
        }
        .camera-scanner-result.not-found {
          background: rgba(239, 68, 68, 0.9);
          color: white;
        }
        .camera-scanner-error {
          padding: 12px 20px;
          font-size: 12px;
          color: #fbbf24;
          background: #1e293b;
          border-top: 1px solid #334155;
          line-height: 1.5;
        }
        .camera-scanner-footer {
          padding: 14px 20px;
          text-align: center;
          font-size: 11px;
          color: #64748b;
          background: #1e293b;
          border-top: 1px solid #334155;
        }
      `}</style>
    </>
  );
}
