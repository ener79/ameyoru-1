import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // 邀请注册会同时上传微信/支付宝两张收款码,单张仍由业务层限制 20MB。
    serverActions: { bodySizeLimit: "45mb" },
  },
};

export default nextConfig;
