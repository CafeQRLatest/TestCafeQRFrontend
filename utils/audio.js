/**
 * Programmatically synthesizes and plays distinct sound alerts using the Web Audio API.
 * Falls back to playing a static mp3 if Web Audio is blocked or unsupported.
 */

// Module-level map to track active looping alarm intervals for delivery orders
const activeAlarms = {};

/**
 * Checks if sound alerts are globally enabled and whether a specific category push preference is active.
 * 
 * @param {string} category - The push alert category (DINE_IN, TAKEAWAY, DELIVERY, SETTLED)
 * @returns {boolean} - True if sound is enabled for the given category
 */
function isSoundAllowed(category) {
  if (typeof window === 'undefined') return false;

  // Global speaker mute/unmute toggle
  const soundEnabled = localStorage.getItem('cafeqr_sound_enabled') !== 'false';
  if (!soundEnabled) return false;

  const c = String(category || '').toUpperCase();
  if (c === 'TAKEAWAY' || c === 'PARCEL') {
    return localStorage.getItem('push_notify_takeaway') !== '0';
  } else if (c === 'DELIVERY') {
    return localStorage.getItem('push_notify_delivery') !== '0';
  } else if (c === 'SETTLED' || c === 'ORDER_SETTLED') {
    return localStorage.getItem('push_notify_settled') !== '0';
  } else {
    // Default to Kitchen / Dine-in preference
    return localStorage.getItem('push_notify_kitchen') !== '0';
  }
}

/**
 * Plays the synthesized delivery alert tone (or static fallback).
 */
function playDeliverySynthesis() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      
      const playTone = (frequency, duration, oscType = 'sine', startTime = 0, volume = 0.12) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = oscType;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTime);
        
        gain.gain.setValueAtTime(volume, ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + duration);
      };

      // Dual-tone urgent alert pattern
      playTone(880, 0.15, 'triangle', 0, 0.12);
      playTone(587.33, 0.15, 'triangle', 0.15, 0.12);
      playTone(880, 0.15, 'triangle', 0.3, 0.12);
      playTone(587.33, 0.25, 'triangle', 0.45, 0.12);
    }
  } catch (synthErr) {
    console.warn('[audio] playDeliverySynthesis failed:', synthErr);
  }
}

export function playDeliveryTone() {
  if (typeof window === 'undefined') return;

  // Try playing MP3 first
  const audio = new Audio('/sounds/delivery.mp3');
  audio.play().catch((err) => {
    console.warn('[audio] Static delivery MP3 play failed, falling back to synthesis:', err);
    playDeliverySynthesis();
  });
}

/**
 * Starts a looping delivery alarm for a specific order.
 * 
 * @param {string} orderId - The unique ID of the order to ring
 */
export function startDeliveryAlarm(orderId) {
  if (typeof window === 'undefined' || !orderId) return;

  // Prevent multiple duplicate loops for the same order
  if (activeAlarms[orderId]) return;

  if (!isSoundAllowed('DELIVERY')) return;

  console.log(`[audio] Starting looping delivery alarm for order: ${orderId}`);

  const audio = new Audio('/sounds/delivery.mp3');
  audio.loop = true;
  
  const alarmState = { type: 'mixed', audio: audio, intervalId: null };
  activeAlarms[orderId] = alarmState;

  audio.play().catch((err) => {
    console.warn('[audio] Initial MP3 delivery loop failed, using synthesis interval:', err);
    
    playDeliverySynthesis();
    
    alarmState.intervalId = setInterval(() => {
      if (!isSoundAllowed('DELIVERY')) {
        stopDeliveryAlarm(orderId);
        return;
      }
      
      // If the MP3 magically started playing (due to late user interaction), clear interval
      if (!audio.paused) {
        clearInterval(alarmState.intervalId);
        alarmState.intervalId = null;
        return;
      }

      // Try playing MP3 again
      audio.play().catch(() => {
        playDeliverySynthesis();
      });
    }, 3500);
  });
}

/**
 * Stops the looping delivery alarm for a specific order.
 * 
 * @param {string} orderId - The unique ID of the order to silence
 */
export function stopDeliveryAlarm(orderId) {
  if (typeof window === 'undefined' || !orderId) return;

  const alarmState = activeAlarms[orderId];
  if (alarmState) {
    console.log(`[audio] Stopping delivery alarm for order: ${orderId}`);
    
    if (typeof alarmState === 'number' || typeof alarmState === 'string') {
      clearInterval(alarmState);
    } else {
      if (alarmState.audio) {
        alarmState.audio.pause();
        alarmState.audio.currentTime = 0;
      }
      if (alarmState.intervalId) {
        clearInterval(alarmState.intervalId);
      }
    }
    
    delete activeAlarms[orderId];
  }
}

/**
 * Plays a single sound alert based on notification type and category.
 * 
 * @param {string} type - Push notification type (e.g. 'new_order', 'order_settled')
 * @param {string} category - Order fulfillment category (e.g. 'DINE_IN', 'TAKEAWAY', 'DELIVERY')
 */
export function playSoundAlert(type, category) {
  if (typeof window === 'undefined') return;

  const t = String(type || '').toLowerCase();
  const c = String(category || '').toUpperCase();

  // If type is order_settled, we map to settled category
  const mappedCategory = (t === 'order_settled') ? 'SETTLED' : c;
  if (!isSoundAllowed(mappedCategory)) return;

  let mp3Path = '/sounds/kitchen.mp3';
  if (t === 'order_settled') {
    mp3Path = '/sounds/settle.mp3';
  } else if (c === 'DELIVERY') {
    playDeliveryTone();
    return;
  } else if (c === 'TAKEAWAY' || c === 'PARCEL') {
    mp3Path = '/sounds/takeaway.mp3';
  }

  // 1. Try static MP3 file play first
  const audio = new Audio(mp3Path);
  audio.play().catch((err) => {
    console.warn('[audio] Static MP3 play blocked/failed, falling back to synthesis:', err);
    
    // 2. Fallback to Web Audio API Synthesis
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        
        const playTone = (frequency, duration, oscType = 'sine', startTime = 0, volume = 0.12) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = oscType;
          osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTime);
          
          gain.gain.setValueAtTime(volume, ctx.currentTime + startTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(ctx.currentTime + startTime);
          osc.stop(ctx.currentTime + startTime + duration);
        };

        if (t === 'order_settled') {
          // Settle Order: Cash register chime (double high ding)
          playTone(2637.02, 0.08, 'sine', 0, 0.1);    // E7
          playTone(3520.00, 0.3, 'sine', 0.06, 0.08);  // A7
          return;
        }

        switch (c) {
          case 'TAKEAWAY':
          case 'PARCEL':
            // Takeaway/Parcel Order: Quick upbeat ascending arpeggio
            playTone(1318.51, 0.1, 'sine', 0, 0.08);   // E6
            playTone(1567.98, 0.1, 'sine', 0.1, 0.08);  // G6
            playTone(2093.00, 0.22, 'sine', 0.2, 0.08); // C7
            break;
          default:
            // Kitchen / Dine-in / Default: Pleasant double chime
            playTone(1046.50, 0.1, 'sine', 0, 0.1);    // C6
            playTone(1567.98, 0.25, 'sine', 0.1, 0.08); // G6
            break;
        }
      }
    } catch (synthErr) {
      console.warn('[audio] Web Audio synthesis also failed:', synthErr);
    }
  });
}
