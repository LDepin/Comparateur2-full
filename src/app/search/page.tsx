// Ce fichier est **server** (pas de "use client"). Il entoure le composant client avec <Suspense/>.
// Il corrige l’erreur Vercel "useSearchParams() should be wrapped in a suspense boundary".

import React, { Suspense } from "react";
import SearchClient from "./SearchClient";

// Force un rendu dynamique (pas de prerender figé) tout en restant compatible Vercel.
// 0 = pas de mise en cache statique ; la page est calculée à chaque requête si nécessaire.
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl p-4">
          <div className="py-8 text-center text-sm text-gray-500">
            Chargement de la recherche…
          </div>
        </main>
      }
    >
      <SearchClient />
    </Suspense>
  );
}