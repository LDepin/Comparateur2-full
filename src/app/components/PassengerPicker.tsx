// src/app/components/PassengerPicker.tsx
"use client";

import React from "react";
import Button from "./ui/Button";
import Select from "./ui/Select";

type Props = {
  adults: number;
  infants: number;
  childrenAges: number[]; // chaque valeur 2..11
  onChange: (next: Partial<{ adults: number; infants: number; childrenAges: number[] }>) => void;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function PassengerPicker({ adults, infants, childrenAges, onChange }: Props) {
  const addChild = () => {
    // valeur par défaut = 7 ans
    const next = [...childrenAges, 7].slice(0, 9);
    onChange({ childrenAges: next });
  };
  const removeChild = (idx: number) => {
    const next = childrenAges.filter((_, i) => i !== idx);
    onChange({ childrenAges: next });
  };
  const setChildAge = (idx: number, age: number) => {
    const a = clamp(Math.floor(age), 2, 11);
    const next = childrenAges.map((v, i) => (i === idx ? a : v));
    onChange({ childrenAges: next });
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="rounded border p-3">
        <div className="text-sm text-gray-600">Adultes</div>
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onChange({ adults: clamp(adults - 1, 1, 9) })}>−</Button>
          <div className="w-10 text-center text-sm">{adults}</div>
          <Button type="button" onClick={() => onChange({ adults: clamp(adults + 1, 1, 9) })}>+</Button>
        </div>
      </div>

      <div className="rounded border p-3">
        <div className="text-sm text-gray-600">Bébés (0–1 an)</div>
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onChange({ infants: clamp(infants - 1, 0, 3) })}>−</Button>
          <div className="w-10 text-center text-sm">{infants}</div>
          <Button type="button" onClick={() => onChange({ infants: clamp(infants + 1, 0, 3) })}>+</Button>
        </div>
      </div>

      <div className="rounded border p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">Enfants (2–11 ans)</div>
          <Button type="button" variant="outline" onClick={addChild}>+ Enfant</Button>
        </div>

        {childrenAges.length === 0 ? (
          <div className="mt-2 text-xs text-gray-500">Aucun enfant</div>
        ) : (
          <div className="mt-2 space-y-2">
            {childrenAges.map((age, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-gray-500">#{idx + 1}</span>
                <Select
                  value={String(age)}
                  onChange={(e) => setChildAge(idx, Number(e.target.value))}
                  className="w-24"
                  aria-label={`Âge enfant ${idx + 1}`}
                >
                  {Array.from({ length: 10 }, (_, i) => 2 + i).map((y) => (
                    <option key={y} value={y}>{y} ans</option>
                  ))}
                </Select>
                <Button type="button" variant="outline" onClick={() => removeChild(idx)}>Retirer</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}