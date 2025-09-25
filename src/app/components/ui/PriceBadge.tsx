// src/app/components/ui/PriceBadge.tsx
"use client";
import React from "react";

export type PriceTone = "low" | "mid" | "high" | "empty";
export function toneClass(t: PriceTone) {
  if (t === "low") return "price-low";
  if (t === "mid") return "price-mid";
  if (t === "high") return "price-high";
  return "price-empty";
}

export default function PriceBadge({ value, tone }: { value: number|null; tone: PriceTone }) {
  return (
    <div className={`rounded border px-6 py-6 text-center text-xl font-medium ${toneClass(tone)}`}>
      {value == null ? "—" : `${value} €`}
    </div>
  );
}