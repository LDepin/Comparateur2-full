// src/app/components/ui/Checkbox.tsx
"use client";
import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

export default function Checkbox({ label, className="", ...rest }: Props) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <input type="checkbox" className="h-4 w-4 rounded border-[var(--color-border)]" {...rest} />
      {label}
    </label>
  );
}