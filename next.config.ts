import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  output: "standalone",
  outputFileTracingExcludes: {
    "*": ["./src/**", "./files/**", "./.git/**"],
  },
};

export default nextConfig;
