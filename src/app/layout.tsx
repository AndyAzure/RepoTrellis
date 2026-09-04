import type { Metadata } from "next";
import "./globals.css";

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export const metadata: Metadata = {
  title: "RepoTrellis",
  description: "把分散的信息，编成值得保留的 GitHub 项目脉络。",
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
