// utils/polyfills.js - Comprehensive polyfills for Android 5.0 - 7.1+ WebViews
import 'core-js/stable';
import 'regenerator-runtime/runtime';

if (typeof window !== 'undefined') {
  // 1. globalThis polyfill
  if (typeof globalThis === 'undefined') {
    (function () {
      if (typeof self !== 'undefined') {
        self.globalThis = self;
      } else if (typeof window !== 'undefined') {
        window.globalThis = window;
      } else if (typeof global !== 'undefined') {
        global.globalThis = global;
      }
    })();
  }

  // 2. requestIdleCallback fallback for Chromium < 47
  if (!window.requestIdleCallback) {
    window.requestIdleCallback = function (cb) {
      const start = Date.now();
      return setTimeout(function () {
        cb({
          didTimeout: false,
          timeRemaining: function () {
            return Math.max(0, 50 - (Date.now() - start));
          },
        });
      }, 1);
    };
  }

  if (!window.cancelIdleCallback) {
    window.cancelIdleCallback = function (id) {
      clearTimeout(id);
    };
  }

  // 3. CustomEvent polyfill for legacy Android WebViews
  if (typeof window.CustomEvent !== 'function') {
    function CustomEvent(event, params) {
      params = params || { bubbles: false, cancelable: false, detail: null };
      const evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
      return evt;
    }
    CustomEvent.prototype = window.Event.prototype;
    window.CustomEvent = CustomEvent;
  }

  // 4. Promise.allSettled fallback for Chromium < 76
  if (!Promise.allSettled) {
    Promise.allSettled = function (promises) {
      return Promise.all(
        Array.from(promises).map(function (p) {
          return Promise.resolve(p).then(
            function (value) {
              return { status: 'fulfilled', value: value };
            },
            function (reason) {
              return { status: 'rejected', reason: reason };
            }
          );
        })
      );
    };
  }

  // 5. Object.fromEntries fallback for Chromium < 73
  if (!Object.fromEntries) {
    Object.fromEntries = function (entries) {
      if (!entries || !entries[Symbol.iterator]) {
        throw new TypeError('Object.fromEntries() requires a single iterable argument');
      }
      const o = {};
      for (const [key, val] of entries) {
        o[key] = val;
      }
      return o;
    };
  }
}

