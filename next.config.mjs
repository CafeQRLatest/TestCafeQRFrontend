const isNativeBuild = process.env.NEXT_PUBLIC_NATIVE_BUILD === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(isNativeBuild
    ? {
        output: 'export',
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
