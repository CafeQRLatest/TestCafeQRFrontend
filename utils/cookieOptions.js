export const getFrontendCookieOptions = (overrides = {}) => ({
  expires: 7,
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  sameSite: 'strict',
  path: '/',
  ...overrides,
});
