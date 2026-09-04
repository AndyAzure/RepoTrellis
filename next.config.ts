import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The in-app browser uses the loopback IP while Next starts on localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
