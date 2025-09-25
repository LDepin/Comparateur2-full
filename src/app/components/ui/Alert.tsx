// src/app/components/ui/Alert.tsx
"use client";
import React from "react";

type Kind = "info" | "warn" | "error" | "success";

export default function Alert({
  kind="info",
  title,
  children,
  className=""
}: React.PropsWithChildren<{ kind?: Kind; title?: string; className?: string }>) {
  const map: Record<Kind, string> = {
    info: "border-blue-300 bg-blue-50 text-blue-800 dark:text-blue-100",
    warn: "border-amber-300 bg-amber-50 text-amber-800 dark:text-amber-100",
    error:"border-red-300 bg-red-50 text-red-800 dark:text-red-100",
    success:"border-green-300 bg-green-50 text-green-800 dark:text-green-100",
  };
  return (
    <div className={`rounded-md border p-3 text-sm ${map[kind]} ${className}`}>
      {title && <div className="font-medium mb-0.5">{title}</div>}
      {children}
    </div>
  );
}