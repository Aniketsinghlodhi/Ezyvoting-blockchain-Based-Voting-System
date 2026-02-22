/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow ethers.js to work in the browser
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = nextConfig;
