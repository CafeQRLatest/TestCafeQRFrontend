import { useEffect, useRef, useCallback } from 'react';
import { findProductByBarcode } from '../domain/products';
import { fetchProductDetails } from '../services/counterSaleApi';

/**
 * Plays an audio beep using Web Audio API (Zero external assets required).
 */
function playScanBeep(success = true) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 1800 : 300, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.25));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
  } catch (e) {
    // Ignore audio context autoplay restriction warnings
  }
}

export default function useBarcodeScanner({
  products,
  addToCart,
  notify,
  search,
  setSearch,
  onUnknownBarcode,
  isEnabled = true
}) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const keyIntervalsRef = useRef([]);

  const processBarcode = useCallback(async (scannedCode) => {
    const code = String(scannedCode || '').trim();
    if (!code) return;

    // 1. Try local in-memory lookup first (Instant O(1))
    const localMatch = findProductByBarcode(products, code);
    if (localMatch) {
      playScanBeep(true);
      await addToCart(localMatch);
      if (notify) notify('success', `Scanned: ${localMatch.name}`);
      if (setSearch) setSearch('');
      return;
    }

    // 2. Fallback to Backend API lookup
    try {
      const response = await fetch(`/api/v1/products/barcode/${encodeURIComponent(code)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      if (response.ok) {
        const json = await response.json();
        const product = json?.data || json;
        if (product && product.id) {
          playScanBeep(true);
          await addToCart(product);
          if (notify) notify('success', `Scanned: ${product.name}`);
          if (setSearch) setSearch('');
          return;
        }
      }
    } catch (err) {
      console.warn('Barcode API lookup failed:', err);
    }

    // 3. Not found anywhere
    playScanBeep(false);
    if (onUnknownBarcode) {
      onUnknownBarcode(code);
    } else if (notify) {
      notify('warning', `No product found for barcode: ${code}`);
    }
  }, [products, addToCart, notify, setSearch, onUnknownBarcode]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e) => {
      const target = e.target;
      const tagName = target?.tagName?.toUpperCase();
      const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable;

      // Allow barcode scanning directly inside the search input box, but ignore in other text inputs (like customer name, discount, etc.)
      const isSearchInput = isInput && (target.placeholder?.toLowerCase().includes('search') || target.name === 'search');
      if (isInput && !isSearchInput) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Enter key marks end of barcode sequence
      if (e.key === 'Enter') {
        const buffer = bufferRef.current.trim();
        const intervals = keyIntervalsRef.current;
        const avgInterval = intervals.length > 0
          ? intervals.reduce((a, b) => a + b, 0) / intervals.length
          : 999;

        // Scanners typically type at < 80ms per keypress
        const isScannerPattern = buffer.length >= 3 && (avgInterval < 80 || isSearchInput);

        if (buffer && isScannerPattern) {
          e.preventDefault();
          e.stopPropagation();
          processBarcode(buffer);
        }

        bufferRef.current = '';
        keyIntervalsRef.current = [];
        return;
      }

      // Record printable single characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (elapsed < 120) {
          keyIntervalsRef.current.push(elapsed);
        } else {
          // Reset buffer if keypress delay was too long (human typing)
          bufferRef.current = '';
          keyIntervalsRef.current = [];
        }

        bufferRef.current += e.key;

        // Keep buffer trimmed
        if (bufferRef.current.length > 60) {
          bufferRef.current = bufferRef.current.slice(-60);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isEnabled, processBarcode]);

  return { processBarcode };
}
