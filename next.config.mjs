const isStaticExport = process.env.NEXT_PUBLIC_NATIVE_BUILD === 'true' || process.env.CF_PAGES === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    styledComponents: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    '@capacitor/core',
    '@capacitor/android',
    '@capacitor/push-notifications',
    '@capawesome/capacitor-app-update',
    '@capawesome/capacitor-app-review',
    'jwt-decode',
    'axios',
  ],
  ...(isStaticExport
    ? {
        output: 'export',
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

export default nextConfig;
