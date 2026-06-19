import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app dir so Next doesn't infer it from a
  // sibling lockfile (admin/package-lock.json).
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "slemvconhlqgxarzfwzk.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: "/v0/b/**/o/**",
      },
      {
        protocol: "https",
        hostname: "*.firebasestorage.app",
        port: "",
        pathname: "/o/**",
      },
      {
        protocol: "https",
        hostname: "**",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "**",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
