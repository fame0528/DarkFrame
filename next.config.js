/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix webpack cache warnings
  webpack: (config, { isServer }) => {
    // Disable webpack caching to prevent cache errors
    // This is safer for development with complex dependencies like Socket.io
    config.cache = false;
    
    return config;
  },

  // Content Security Policy headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
              "worker-src 'self' blob:", // Allow Web Workers for canvas-confetti
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' ws: wss:",
            ].join('; '),
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
