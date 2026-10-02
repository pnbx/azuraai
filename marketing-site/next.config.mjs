/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Zibal's /start/{trackId} page requires a Referer whose domain
          // matches the gateway's registered website. This policy sends the
          // site origin cross-origin (https://azuraai.ir) explicitly, so the
          // payment page always opens regardless of browser defaults.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
