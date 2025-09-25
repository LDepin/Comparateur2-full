// src/app/components/ui/Input.tsx
"use client";
import React from "react";

export default function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className="", ...rest } = props;
  return (
    <input
      className={`w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      {...rest}
    />
  );
}