import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@aws-sdk/client-ses",
    "@aws-sdk/client-bedrock-runtime",
    "@aws-sdk/client-bedrock-agent-runtime",
    "@aws-sdk/client-s3",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-dynamodb",
  ],
};

export default nextConfig;
