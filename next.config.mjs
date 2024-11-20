import { withContentlayer } from "next-contentlayer";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: "build",
  output: "export",
  assetPrefix: process.env.GITHUB_PAGES ? "/blog" : "",
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  transpilePackages: ["next-mdx-remote"],
};

export default withContentlayer(nextConfig);
