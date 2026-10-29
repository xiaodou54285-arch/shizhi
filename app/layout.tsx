import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拾知 · 我的学习空间",
  description: "课程、课堂提问、复习与纸质笔记，跨设备保存。",
  icons: {
    icon: "/favicon.svg?v=leaf-1",
    shortcut: "/favicon.svg?v=leaf-1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
