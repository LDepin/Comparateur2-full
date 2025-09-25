// src/app/components/ui/CalendarGrid.tsx
"use client";
import React, { useMemo } from "react";
import PriceBadge, { PriceTone } from "./PriceBadge";

export type CalendarDay = { prix: number | null; disponible: boolean };
export type CalendarMap = Record<string, CalendarDay>;

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const firstDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDay  = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0);

export default function CalendarGrid({
  monthCursor,
  data,
  stats,
  selectedDate,
  onPrev,
  onNext,
  onSelect,
}: {
  monthCursor: Date;
  data: CalendarMap;
  stats: { min: number; max: number };
  selectedDate: string;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (d: Date) => void;
}) {
  const labels = ["L","M","M","J","V","S","D"];

  const days: (Date|null)[] = useMemo(() => {
    const f = firstDay(monthCursor);
    const l = lastDay(monthCursor);
    const startCol = (f.getDay() + 6) % 7; // Lundi=0
    const arr: (Date|null)[] = [];
    for (let i=0;i<startCol;i++) arr.push(null);
    for (let d=1; d<=l.getDate(); d++) {
      arr.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    return arr;
  }, [monthCursor]);

  const toneOf = (value: number|null): PriceTone => {
    if (value == null) return "empty";
    if (stats.max === stats.min) return "low";
    const t = (value - stats.min) / Math.max(1, (stats.max - stats.min));
    if (t <= 0.33) return "low";
    if (t <= 0.66) return "mid";
    return "high";
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={onPrev} className="rounded border px-2 py-1">◀</button>
        <div className="min-w-[180px] text-center font-medium">
          {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </div>
        <button type="button" onClick={onNext} className="rounded border px-2 py-1">▶</button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs text-gray-500">
        {labels.map((w, i) => <div key={`lab-${i}`}>{w}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((d, i) => d ? (
          <button
            key={fmt(d)}
            onClick={() => onSelect(d)}
            title={fmt(d)}
            className={[
              "rounded border transition hover:shadow",
              "h-[72px] sm:h-[84px] md:h-[96px]",
              "flex flex-col justify-between px-2 py-2",
              fmt(d) === selectedDate ? "ring-2 ring-blue-400" : "",
            ].join(" ")}
          >
            <div className={`text-sm ${fmt(d) === selectedDate ? "font-semibold" : ""}`}>{d.getDate()}</div>
            <div>
              {(() => {
                const info = data[fmt(d)];
                const value = info?.prix ?? null;
                const tone = toneOf(value);
                return <PriceBadge value={value} tone={tone} />;
              })()}
            </div>
          </button>
        ) : (
          <div key={`empty-${i}`} className="h-[72px] sm:h-[84px] md:h-[96px] rounded border opacity-30" />
        ))}
      </div>
    </div>
  );
}