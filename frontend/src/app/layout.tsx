import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NotificationCenter from "@/components/layout/NotificationCenter";
import AuthGate from "@/components/auth/AuthGate";
import UserManagementWorkspace from "@/components/admin/UserManagementWorkspace";
import Link from "next/link";
import { UserRound } from "lucide-react";

const geistSans=Geist({variable:"--font-geist-sans",subsets:["latin"]});
const geistMono=Geist_Mono({variable:"--font-geist-mono",subsets:["latin"]});
export const metadata:Metadata={title:"Market Memory — Historical Pattern Intelligence",description:"Search historical market structure and compare the present pattern with prior market behavior."};
export default function RootLayout({children}:LayoutProps<"/">){return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}><body className="min-h-full"><div className="relative min-h-full"><div className="fixed right-4 top-2 z-[60] flex items-center gap-2 sm:right-5"><Link href="/settings" aria-label="Account settings" title="Account settings" className="flex h-8 w-8 items-center justify-center rounded-md border border-white/8 bg-[#070a0f]/90 text-white/40 backdrop-blur hover:bg-white/[.04] hover:text-white/80"><UserRound size={15}/></Link><NotificationCenter/></div><AuthGate>{children}</AuthGate><UserManagementWorkspace/></div></body></html>}
