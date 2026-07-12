import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/finance/quotations/**": [
      "./assets/fonts/noto-sans-thai/NotoSansThai-Regular.ttf",
      "./assets/fonts/noto-sans-thai/NotoSansThai-Bold.ttf",
      "./assets/fonts/noto-sans-thai/OFL.txt",
    ],
  },
};

export default nextConfig;
