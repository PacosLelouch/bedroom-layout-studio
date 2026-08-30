import type { Metadata } from "next";
import "./globals.css";

const pagesBasePath =
  process.env.GITHUB_PAGES === "true"
    ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
    : "";
const faviconPath = `${pagesBasePath}/favicon.svg`;

export const metadata: Metadata = {
  title: "卧室布局工作台",
  description: "可交互编辑多个卧室布局，并接入 img2threejs 程序化家具资产。",
  icons: { icon: faviconPath, shortcut: faviconPath },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><head><meta name="codex-preview" content="development" /></head><body>{children}</body></html>;
}
