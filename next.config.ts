import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/finance/quotations/**": [
      "./node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff",
      "./node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-latin-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-latin-700-normal.woff",
    ],
  },
};

export default nextConfig;
