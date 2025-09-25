"use client";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Évite le double en dev (HMR)
    const already = (window as any).__sw_registered;
    if (already) return;
    (window as any).__sw_registered = true;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Optionnel: console.log("SW registered");
      } catch {
        // silencieux en dev
      }
    };
    register();
  }, []);

  return null;
}