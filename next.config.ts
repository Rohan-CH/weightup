import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Skip prerendering for all pages — our app is fully dynamic (auth-gated)
  experimental: {
  },
};

export default nextConfig;
