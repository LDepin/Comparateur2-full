// src/app/components/ui/Badge.tsx
"use client";
import React from "react";

export default function Badge({ children, className="" }: React.PropsWithChildren<{className?: string}>) {
  return <span className={`badge ${className}`}>{children}</span>;
}