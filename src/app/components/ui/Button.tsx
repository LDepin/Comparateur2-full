// src/app/components/ui/Button.tsx
"use client";
import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
};

export default function Button({ variant="primary", size="md", className="", ...rest }: Props) {
  const base = "inline-flex items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";
  const sizes = size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3.5 py-2 text-sm";
  const variants =
    variant === "ghost" ? "bg-transparent hover:bg-black/5 dark:hover:bg-white/10"
    : variant === "outline" ? "border border-[var(--color-border)] hover:bg-black/5 dark:hover:bg-white/10"
    : "bg-blue-600 text-white hover:bg-blue-700";
  return <button className={`${base} ${sizes} ${variants} ${className}`} {...rest} />;
}