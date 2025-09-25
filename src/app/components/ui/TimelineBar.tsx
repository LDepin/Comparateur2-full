// src/app/components/ui/TimelineBar.tsx
"use client";
import React from "react";

export default function TimelineBar({
  items,
  selectedIndex,
  onSelect,
}: {
  items: Array<{ start: number; end: number }>;
  selectedIndex: number;
  onSelect: (i: number) => void;
}) {
  if (!items.length) return null;

  const dayStart = new Date(new Date(items[0].start).setHours(0,0,0,0)).getTime();
  const dayEnd = dayStart + 24*3600*1000;

  const bars = items.map(({start,end}) => {
    const s = Math.max(dayStart, Math.min(start, dayEnd));
    const e = Math.max(dayStart + 10*60*1000, Math.min(end, dayEnd));
    const left = ((s - dayStart) / (dayEnd - dayStart)) * 100;
    const width = ((e - s) / (dayEnd - dayStart)) * 100;
    return { left, width };
  }).filter(b => isFinite(b.left) && isFinite(b.width));

  return (
    <div className="mt-6">
      <div className="mb-1 text-xs text-gray-500">Timeline (barre surlignée = résultat sélectionné)</div>
      <div className="relative h-4 sm:h-5 md:h-6 w-full rounded border bg-gray-50">
        {bars.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`absolute top-0 h-full rounded focus:outline-none ${i===selectedIndex ? "bg-blue-600" : "bg-blue-300/80"}`}
            style={{ left: `${b.left}%`, width: `${Math.max(b.width, 2)}%` }}
            title={`Résultat ${i+1}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
      </div>
    </div>
  );
}