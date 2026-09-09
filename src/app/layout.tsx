import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { isClerkConfigured } from "@/lib/clerk-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NflGameSim",
  description:
    "Current-week NFL game simulator. Model projections and user-typed lines. half_ppr default.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  const authEnabled = isClerkConfigured();
  const shell = (
    <>
      <Header authEnabled={authEnabled} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-slate-500">
        Model-only outputs · current week · half_ppr · schema 1.0.0
      </footer>
    </>
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#070b14] font-sans text-slate-100">
        {authEnabled ? <ClerkProvider>{shell}</ClerkProvider> : shell}
      </body>
    </html>
  );
}
