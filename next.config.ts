import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // the dev badge sat on top of the admin bell
  experimental: {
    // owner photo uploads from the phone (admin -> Photos)
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default nextConfig;
