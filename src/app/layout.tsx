// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SWRegister from "./SWRegister"; // ← garde ce chemin si ton fichier est app/SWRegister.tsx

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0ea5e9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Icônes Apple optionnelles si tu veux aller plus loin :
            <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        */}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SWRegister />
        {children}
      </body>
    </html>
  );
}