// src/app/dev/pwa-reset/page.tsx
"use client";

import ResetPWALocal from "@/app/components/ResetPWALocal";

export default function PageResetPWA() {
  return (
    <main className="mx-auto max-w-xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Reset PWA (local)</h1>
      <p className="text-sm text-gray-600">
        Cette page désenregistre le Service Worker, vide les caches et le stockage du navigateur,
        puis recharge l’application. Utile en développement si le SW garde un état obsolète.
      </p>

      <ResetPWALocal floating={false} label="Désinstaller SW + vider caches" />

      <div className="pt-4 text-xs text-gray-500">
        Astuce : en prod, cette page ne rend rien (sécurité). Sur Vercel, utilisez la commande du navigateur :
        DevTools → Application → Service workers / Manifest.
      </div>
    </main>
  );
}