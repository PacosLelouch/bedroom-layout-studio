import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "卧室布局工作台",
  description: "可交互编辑多个卧室布局，并接入 img2threejs 程序化家具资产。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
