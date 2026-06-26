// utils/timezoneUtils.js
// Centralized timezone utilities for the CafeQR app.
// Maps the profile's "UTC+5:30 (India)" format to IANA timezone IDs,
// and provides consistent date/time formatting throughout the app.

/**
 * Map of known timezone labels → IANA timezone IDs.
 * Expand as needed when adding new countries.
 */
const TZ_MAP = {
  // Asia - South
  'India':                'Asia/Kolkata',
  'Sri Lanka':            'Asia/Colombo',
  'Nepal':                'Asia/Kathmandu',
  'Pakistan':             'Asia/Karachi',
  'Bangladesh':           'Asia/Dhaka',
  'Maldives':             'Indian/Maldives',
  // Asia - Middle East
  'UAE':                  'Asia/Dubai',
  'United Arab Emirates': 'Asia/Dubai',
  'Saudi Arabia':         'Asia/Riyadh',
  'Qatar':                'Asia/Qatar',
  'Oman':                 'Asia/Muscat',
  'Kuwait':               'Asia/Kuwait',
  'Bahrain':              'Asia/Bahrain',
  'Jordan':               'Asia/Amman',
  'Lebanon':              'Asia/Beirut',
  'Iraq':                 'Asia/Baghdad',
  'Iran':                 'Asia/Tehran',
  'Turkey':               'Europe/Istanbul',
  'Israel':               'Asia/Jerusalem',
  // Asia - Southeast
  'Singapore':            'Asia/Singapore',
  'Malaysia':             'Asia/Kuala_Lumpur',
  'Thailand':             'Asia/Bangkok',
  'Indonesia':            'Asia/Jakarta',
  'Philippines':          'Asia/Manila',
  'Vietnam':              'Asia/Ho_Chi_Minh',
  'Cambodia':             'Asia/Phnom_Penh',
  'Myanmar':              'Asia/Yangon',
  // Asia - East
  'Japan':                'Asia/Tokyo',
  'South Korea':          'Asia/Seoul',
  'China':                'Asia/Shanghai',
  'Hong Kong':            'Asia/Hong_Kong',
  'Taiwan':               'Asia/Taipei',
  // Europe
  'UK':                   'Europe/London',
  'United Kingdom':       'Europe/London',
  'Germany':              'Europe/Berlin',
  'France':               'Europe/Paris',
  'Italy':                'Europe/Rome',
  'Spain':                'Europe/Madrid',
  'Portugal':             'Europe/Lisbon',
  'Netherlands':          'Europe/Amsterdam',
  'Belgium':              'Europe/Brussels',
  'Switzerland':          'Europe/Zurich',
  'Austria':              'Europe/Vienna',
  'Sweden':               'Europe/Stockholm',
  'Norway':               'Europe/Oslo',
  'Denmark':              'Europe/Copenhagen',
  'Finland':              'Europe/Helsinki',
  'Ireland':              'Europe/Dublin',
  'Greece':               'Europe/Athens',
  'Poland':               'Europe/Warsaw',
  'Czech Republic':       'Europe/Prague',
  'Romania':              'Europe/Bucharest',
  'Hungary':              'Europe/Budapest',
  'Russia':               'Europe/Moscow',
  // Americas
  'USA':                  'America/New_York',
  'United States':        'America/New_York',
  'Canada':               'America/Toronto',
  'Mexico':               'America/Mexico_City',
  'Brazil':               'America/Sao_Paulo',
  'Argentina':            'America/Argentina/Buenos_Aires',
  'Colombia':             'America/Bogota',
  'Chile':                'America/Santiago',
  'Peru':                 'America/Lima',
  // Africa
  'South Africa':         'Africa/Johannesburg',
  'Kenya':                'Africa/Nairobi',
  'Nigeria':              'Africa/Lagos',
  'Egypt':                'Africa/Cairo',
  'Ghana':                'Africa/Accra',
  'Tanzania':             'Africa/Dar_es_Salaam',
  'Ethiopia':             'Africa/Addis_Ababa',
  'Morocco':              'Africa/Casablanca',
  // Oceania
  'Australia':            'Australia/Sydney',
  'New Zealand':          'Pacific/Auckland',
  'Fiji':                 'Pacific/Fiji',
};

/**
 * Fixed offset → IANA fallback for offsets without a country match.
 */
const OFFSET_FALLBACK = {
  '+5:30':  'Asia/Kolkata',
  '+5:45':  'Asia/Kathmandu',
  '+5:00':  'Asia/Karachi',
  '+4:00':  'Asia/Dubai',
  '+3:30':  'Asia/Tehran',
  '+3:00':  'Asia/Riyadh',
  '+2:00':  'Africa/Cairo',
  '+1:00':  'Europe/Berlin',
  '+0:00':  'Europe/London',
  '-3:00':  'America/Sao_Paulo',
  '-4:00':  'America/Santiago',
  '-5:00':  'America/New_York',
  '-6:00':  'America/Chicago',
  '-7:00':  'America/Denver',
  '-8:00':  'America/Los_Angeles',
  '-9:00':  'America/Anchorage',
  '-10:00': 'Pacific/Honolulu',
  '+6:00':  'Asia/Dhaka',
  '+6:30':  'Asia/Yangon',
  '+7:00':  'Asia/Bangkok',
  '+8:00':  'Asia/Singapore',
  '+9:00':  'Asia/Tokyo',
  '+9:30':  'Australia/Adelaide',
  '+10:00': 'Australia/Sydney',
  '+12:00': 'Pacific/Auckland',
};

/**
 * Resolves the profile's timezone string to an IANA timezone ID.
 *
 * Accepts formats:
 *  - "UTC+5:30 (India)"
 *  - "India (GMT+5:30)"
 *  - "Asia/Kolkata"   (passthrough)
 *  - "UTC+5:30"
 *  - null/undefined   → falls back to browser timezone
 *
 * @param {string|null} profileTz - The timezone string from AuthContext
 * @returns {string} IANA timezone ID
 */
export function resolveTimezone(profileTz) {
  if (!profileTz) {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
  }

  const s = profileTz.trim();

  // Already an IANA ID (contains '/')
  if (s.includes('/') && !s.includes('UTC') && !s.includes('GMT')) return s;

  // Try to extract country name from parenthetical
  const parenMatch = s.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const country = parenMatch[1].trim();
    if (TZ_MAP[country]) return TZ_MAP[country];
  }

  // Try the part before parenthetical as country (e.g. "India (GMT+5:30)")
  const beforeParen = s.split('(')[0].trim();
  if (TZ_MAP[beforeParen]) return TZ_MAP[beforeParen];

  // Try offset fallback
  const offsetMatch = s.match(/([+-]\d+:\d+)/);
  if (offsetMatch) {
    const offset = offsetMatch[1];
    if (OFFSET_FALLBACK[offset]) return OFFSET_FALLBACK[offset];
  }

  // Last resort: browser timezone
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

/**
 * Formats a date value to a localized string in the profile's timezone.
 *
 * @param {string|Date|number|null} value - ISO string, Date object, or timestamp
 * @param {string|null} profileTz - Timezone string from AuthContext (e.g. "UTC+5:30 (India)")
 * @param {object} [options] - Additional Intl.DateTimeFormat options
 * @param {string} [options.format='datetime'] - 'date', 'time', 'datetime', 'short', 'full'
 * @param {string} [options.locale='en-IN'] - Locale string
 * @returns {string} Formatted date string, or '—' if invalid
 */
export function formatTzDate(value, profileTz, options = {}) {
  if (!value) return '—';

  try {
    let date;
    if (value instanceof Date) {
      date = value;
    } else {
      let strVal = String(value);
      // Backend LocalDateTime is generated in UTC. Append Z to force UTC parsing.
      if (typeof value === 'string' && value.length >= 19 && value.includes('T') && !value.includes('Z') && !value.match(/[+-]\d{2}:\d{2}$/)) {
        strVal = value + 'Z';
      }
      date = new Date(strVal);
    }
    if (isNaN(date.getTime())) return '—';

    const tz = resolveTimezone(profileTz);
    const locale = options.locale || 'en-IN';
    const format = options.format || 'datetime';

    let dtfOptions = { timeZone: tz };

    switch (format) {
      case 'date':
        dtfOptions = { ...dtfOptions, day: '2-digit', month: 'short', year: 'numeric' };
        break;
      case 'time':
        dtfOptions = { ...dtfOptions, hour: '2-digit', minute: '2-digit', hour12: true };
        break;
      case 'short':
        dtfOptions = { ...dtfOptions, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true };
        break;
      case 'full':
        dtfOptions = { ...dtfOptions, day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        break;
      case 'datetime':
      default:
        dtfOptions = { ...dtfOptions, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
        break;
    }

    // Merge any custom overrides
    if (options.day) dtfOptions.day = options.day;
    if (options.month) dtfOptions.month = options.month;
    if (options.year) dtfOptions.year = options.year;
    if (options.hour) dtfOptions.hour = options.hour;
    if (options.minute) dtfOptions.minute = options.minute;
    if (options.second) dtfOptions.second = options.second;
    if (options.hour12 !== undefined) dtfOptions.hour12 = options.hour12;

    return new Intl.DateTimeFormat(locale, dtfOptions).format(date);
  } catch (e) {
    console.warn('formatTzDate error:', e);
    return '—';
  }
}

/**
 * Returns the current date/time as a Date object adjusted to the profile's timezone.
 * Useful for initializing date pickers to "now" in the business timezone.
 *
 * @param {string|null} profileTz - Timezone string from AuthContext
 * @returns {Date}
 */
export function getBusinessNow(profileTz) {
  const tz = resolveTimezone(profileTz);
  try {
    // Get current time in the target timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const get = (type) => (parts.find(p => p.type === type)?.value || '00');
    
    return new Date(
      parseInt(get('year')),
      parseInt(get('month')) - 1,
      parseInt(get('day')),
      parseInt(get('hour')),
      parseInt(get('minute')),
      parseInt(get('second'))
    );
  } catch {
    return new Date();
  }
}

/**
 * Returns a local ISO-like string (YYYY-MM-DDTHH:mm) for the business timezone.
 * Useful for date picker default values.
 *
 * @param {string|null} profileTz
 * @param {Date} [date] - defaults to now
 * @returns {string}
 */
export function getLocalISOString(profileTz, date) {
  const d = date || getBusinessNow(profileTz);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Converts a business local ISO string (YYYY-MM-DDTHH:mm) to a real UTC ISO string.
 * This ensures that when the user selects a time in the UI, we send the exact matching UTC time to the backend.
 *
 * @param {string|null} localIso - Local ISO string (e.g. "2026-06-26T03:53")
 * @param {string|null} profileTz - Timezone string from AuthContext
 * @returns {string|undefined} UTC ISO string (e.g. "2026-06-25T23:53:00.000Z")
 */
export function businessTimeToUtc(localIso, profileTz) {
  if (!localIso) return undefined;
  const tz = resolveTimezone(profileTz);
  
  // 1. Guess the Date by parsing localIso as browser local time.
  const guess = new Date(`${localIso}:00`);
  if (isNaN(guess.getTime())) return undefined;

  // 2. Format the guess in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  const getParts = (d) => {
    const parts = formatter.formatToParts(d);
    return {
      year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
      month: parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1,
      day: parseInt(parts.find(p => p.type === 'day')?.value || '1'),
      hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
      minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
      second: parseInt(parts.find(p => p.type === 'second')?.value || '0'),
    };
  };

  // We want the getParts(actualDate) to match our target parts.
  const target = new Date(localIso + 'Z'); // Treats it as UTC just to extract parts
  const targetMs = target.getTime();

  // Find the offset of the guess date in the target timezone
  const guessParts = getParts(guess);
  const guessLocalAsUtc = Date.UTC(guessParts.year, guessParts.month, guessParts.day, guessParts.hour, guessParts.minute, guessParts.second);
  
  // The difference between the formatted guess and the true guess is the offset
  const offsetMs = guessLocalAsUtc - guess.getTime();
  
  // So the actual UTC time is target local time minus offset
  const actualDate = new Date(targetMs - offsetMs);
  
  return actualDate.toISOString();
}
