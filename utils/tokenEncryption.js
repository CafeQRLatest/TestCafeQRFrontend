/**
 * tokenEncryption.js
 * Utility to encrypt/decrypt orgId tokens so raw UUIDs are hidden from users.
 */

export function encryptOrgId(uuid) {
  if (!uuid) return '';
  try {
    const str = String(uuid).trim();
    if (typeof window !== 'undefined' && window.btoa) {
      return 'enc_' + btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } else {
      return 'enc_' + Buffer.from(str, 'utf8').toString('base64url');
    }
  } catch (e) {
    return uuid;
  }
}

export function decryptOrgId(token) {
  if (!token) return '';
  const clean = String(token).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return clean;
  }
  if (clean.startsWith('enc_')) {
    try {
      const rawB64 = clean.slice(4).replace(/-/g, '+').replace(/_/g, '/');
      const decoded = typeof window !== 'undefined' && window.atob
        ? atob(rawB64)
        : Buffer.from(rawB64, 'base64').toString('utf8');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
        return decoded.trim();
      }
    } catch (e) { }
  }
  return clean;
}
