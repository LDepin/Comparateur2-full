// src/app/components/ui/useToast.ts
"use client";
import { useState, useCallback } from "react";

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => setMsg(m), []);
  const hide = useCallback(() => setMsg(null), []);
  return { msg, show, hide };
}