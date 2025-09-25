// src/app/components/ui/Select.tsx
"use client";
import React from "react";

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;

export default function Select({ className = "", ...rest }: Props) {
  return (
    <select
      className={`w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      {...rest}
    />
  );
}