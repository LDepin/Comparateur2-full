// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SWRegister from "./SWRegister"; // garde ce chemin (app/SWRegister.tsx)
import OfflineBanner from "./components/OfflineBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Comparateur2",
  description: "Comparateur de vols (Amadeus + fallback) — PWA",
  applicationName: "Comparateur2",
  manifest: "/manifest.webmanifest",
  themeColor: "#0ea5e9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0ea5e9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* (Optionnel) Icône Apple si tu veux : */}
        {/* <link rel="apple-touch-icon" href="/icons/icon-192.png" /> */}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Service Worker + bannière hors-ligne (clients) */}
        <SWRegister />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}