/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel preview builds were timing out static generation for API/page workers (60s default).
  staticPageGenerationTimeout: 180,
  experimental: {
    instrumentationHook: true
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' }
    ]
  }
};
module.exports = nextConfig;
