/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/market",
        has: [{ type: "query", key: "itemId", value: "(?<itemId>.*)" }],
        destination: "/?market=true&marketItemId=:itemId",
        permanent: true,
      },
      {
        source: "/market",
        destination: "/?market=true",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.blob.vercel-storage.com", port: "", pathname: "/**", search: "" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com", port: "", pathname: "/**", search: "" },
    ],
  },
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

