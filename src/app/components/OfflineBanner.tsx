// src/app/components/OfflineBanner.tsx
"use client";

import React, { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(true);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("onLine" in navigator)) return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 px-3 py-2 text-sm"
      style={{
        background: "var(--color-attention-bg, rgba(255,245,231,0.98))",
        color: "var(--color-attention-fg, #7a4a00)",
        boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.06))",
        borderBottom: "1px solid var(--color-border, #e5e7eb)",
      }}
    >
      <span>🔌 Hors connexion : données en direct indisponibles.</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-2 rounded border px-2 py-0.5 text-xs"
        style={{
          borderColor: "var(--color-border, #e5e7eb)",
          background: "transparent",
        }}
        aria-label="Fermer l’alerte hors connexion"
      >
        Fermer
      </button>
    </div>
  );
}