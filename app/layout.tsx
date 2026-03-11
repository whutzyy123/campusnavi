import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { ToastProvider } from "@/components/toast-provider";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";

export const metadata: Metadata = {
  title: "校园生存指北",
  description: "精细化校区地理信息系统",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#FF4500",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex flex-col h-screen h-screen-dvh overflow-hidden">
        <Navbar />
        <ToastProvider />
        <PageViewTracker />
        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </body>
    </html>
  );
}

