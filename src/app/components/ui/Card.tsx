// src/app/components/ui/Card.tsx
"use client";
import React from "react";

export default function Card({ children, className="" }: React.PropsWithChildren<{className?: string}>) {
  return <div className={`card p-3 ${className}`}>{children}</div>;
}