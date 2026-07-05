/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Static exports don't support custom headers or rewrites at build time,
  // but they are supported during 'next dev' (local development).
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
