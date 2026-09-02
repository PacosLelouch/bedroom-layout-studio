import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPagesBuild
  ? (process.env.PUBLIC_BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  : "";

const nextConfig: NextConfig = {
  ...(isGitHubPagesBuild
    ? {
        webpack(config) {
          config.resolve.extensionAlias = {
            ...config.resolve.extensionAlias,
            ".js": [".ts", ".tsx", ".js"],
          };
          return config;
        },
        output: "export",
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
        typescript: { tsconfigPath: "tsconfig.pages.json" },
      }
    : {}),
};

export default nextConfig;
