// src/app/SWRegister.tsx
"use client";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // On considère localhost et *.local comme environnement de dev
    const isLocal =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname.endsWith(".local");

    // En dev/local : s'assurer qu'aucun SW ne reste actif, et ne pas en enregistrer
    const cleanupLocal = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch {}
    };

    if (isLocal) {
      cleanupLocal();
      return; // rien à enregistrer en local
    }

    // En prod : éviter le double enregistrement (HMR/Navigation)
    const already = (window as any).__sw_registered;
    if (already) return;
    (window as any).__sw_registered = true;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // console.log("SW registered");
      } catch {
        // silencieux
      }
    };

    register();
  }, []);

  return null;
}