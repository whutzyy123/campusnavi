import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: "校园生存指北",
  description: "精细化校区地理信息系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex flex-col h-screen overflow-hidden">
        <Navbar />
        <ToastProvider />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}

