// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Comparateur2",
  description: "Comparateur de vols — Amadeus + fallback dummy",
  applicationName: "Comparateur2",
  themeColor: "#0ea5e9",
  manifest: "/manifest.webmanifest",
};

function SWRegister() {
  // Client-only light SW register
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      const has = regs.some((r) => r.active?.scriptURL.endsWith("/sw.js"));
      if (!has) navigator.serviceWorker.register("/sw.js");
    }).catch(() => {});
  }
  return null;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <meta name="theme-color" content="#0ea5e9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        {/* Enregistrement SW */}
        <SWRegister />
      </body>
    </html>
  );
}