// src/app/calendar/page.tsx
import React, { Suspense } from "react";
import CalendarClient from "./CalendarClient";

// Forcer un rendu dynamique (pas de pré-render figé)
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl p-4">
          <div className="py-8 text-center text-sm text-gray-500">
            Chargement du calendrier…
          </div>
        </main>
      }
    >
      <CalendarClient />
    </Suspense>
  );
}