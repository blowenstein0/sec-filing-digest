import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@aws-sdk/client-ses",
    "@aws-sdk/client-bedrock-runtime",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-dynamodb",
  ],
};

export default nextConfig;
