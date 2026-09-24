/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Canonical host: apex (dhaka-tesla-pool.com) redirects to www, so the
  // site has one address (https://www.dhaka-tesla-pool.com) everywhere.
  // www itself is untouched (no rule matches it), so no loop is possible.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'dhaka-tesla-pool.com' }],
        destination: 'https://www.dhaka-tesla-pool.com/:path*',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
