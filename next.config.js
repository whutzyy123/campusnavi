/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 允许外部脚本（高德地图）
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

