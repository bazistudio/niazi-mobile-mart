import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_EXPORT === "true" ? "export" : undefined, // 'export' for Electron static build, undefined for Vercel
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/dashboard/shop-admin/products',
        destination: '/dashboard/shop-admin/inventory',
        permanent: false,
      },
      {
        source: '/dashboard/shop-admin/stock',
        destination: '/dashboard/shop-admin/inventory/stock',
        permanent: false,
      },
      {
        source: '/dashboard/shop-admin/import',
        destination: '/dashboard/shop-admin/inventory/import',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
