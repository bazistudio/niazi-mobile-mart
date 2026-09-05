import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/lib/api/interceptors"; // registers Axios interceptors (device-id + 401 refresh)
import AuthHydrator from "@/components/auth/AuthHydrator";
import { Toaster } from "react-hot-toast";
import ReactQueryProvider from "@/components/providers/ReactQueryProvider";
import { GlobalPrintPreviewModal } from "@/lib/printer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TijaratPro ERP",
  description: "Multi-tenant ERP platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ReactQueryProvider>
          <Toaster position="bottom-right" />
          {/* Rehydrates Zustand store from localStorage on every page load */}
          <AuthHydrator />
          <div className="flex flex-col min-h-screen">
            <div className="flex-1 flex flex-col min-h-0 relative">
              {children}
            </div>
          </div>
          <GlobalPrintPreviewModal />
        </ReactQueryProvider>
      </body>
    </html>
  );
}
