import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NotificationCenter from "@/components/layout/NotificationCenter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Market Memory — Historical Pattern Intelligence",
  description:
    "Search historical market structure and compare the present pattern with prior market behavior.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="relative min-h-full">
          <div className="fixed right-4 top-2 z-[60] sm:right-5">
            <NotificationCenter />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
