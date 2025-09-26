// src/app/components/ResetPWALocal.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";

type Props = {
  floating?: boolean;         // bouton flottant en bas à droite
  label?: string;             // texte du bouton si non flottant
  confirm?: boolean;          // demande une confirmation
  className?: string;
};

/**
 * Outil DEV : reset complet PWA côté navigateur (désenregistre SW, clear caches, storages) puis reload.
 * En PROD, le composant ne rend rien par sécurité.
 */
export default function ResetPWALocal({
  floating = true,
  label = "Reset PWA local",
  confirm = true,
  className = "",
}: Props) {
  const [busy, setBusy] = useState(false);

  // On cache en production par défaut
  const isProd = useMemo(() => {
    try {
      return process.env.NODE_ENV === "production";
    } catch {
      return false;
    }
  }, []);

  const doReset = useCallback(async () => {
    if (confirm) {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(
        "Réinitialiser la PWA locale ? (Désenregistre le Service Worker, vide les caches et le stockage, puis recharge.)"
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      // 1) SW unregister (tous)
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }

      // 2) Cache Storage
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }

      // 3) IndexedDB
      const anyWin = window as any;
      if (anyWin.indexedDB && typeof (anyWin.indexedDB as any).databases === "function") {
        try {
          const dbs = await (anyWin.indexedDB as any).databases();
          await Promise.all(
            (dbs || []).map((db: any) => {
              const name = db?.name;
              if (!name) return Promise.resolve();
              return new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              });
            })
          );
        } catch {
          // silencieux si non supporté
        }
      }

      // 4) Web Storage
      try {
        window.localStorage?.clear();
      } catch {}
      try {
        window.sessionStorage?.clear();
      } catch {}

      // 5) Reload dur
      window.location.replace(window.location.origin + "/");
    } finally {
      setBusy(false);
    }
  }, [confirm]);

  if (isProd) return null;

  if (floating) {
    return (
      <button
        type="button"
        onClick={doReset}
        disabled={busy}
        title="Reset PWA local (dev)"
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 70,
          padding: "10px 12px",
          borderRadius: 9999,
          boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,.15))",
          background: busy ? "#94a3b8" : "#0ea5e9",
          color: "white",
          opacity: 0.9,
        }}
        className={className}
      >
        {busy ? "…" : "Reset PWA"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={doReset}
      disabled={busy}
      className={`rounded-md border px-3 py-2 text-sm ${className}`}
      style={{ borderColor: "var(--color-border, #e5e7eb)" }}
    >
      {busy ? "…" : label}
    </button>
  );
}