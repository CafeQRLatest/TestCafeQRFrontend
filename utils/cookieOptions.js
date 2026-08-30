export const getFrontendCookieOptions = (overrides = {}) => {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return {
    expires: 7,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    ...overrides,
  };
};

