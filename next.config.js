/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix webpack cache warnings
  webpack: (config, { isServer }) => {
    // Disable webpack caching to prevent cache errors
    // This is safer for development with complex dependencies like Socket.io
    config.cache = false;
    
    return config;
  },
}

module.exports = nextConfig
