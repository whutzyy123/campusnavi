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
    const securityHeaders = [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "X-Frame-Options",
        value: "SAMEORIGIN",
      },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'self'",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), payment=(), usb=()",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
