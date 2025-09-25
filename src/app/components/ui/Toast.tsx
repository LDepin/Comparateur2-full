// src/app/components/ui/Toast.tsx
"use client";
import React from "react";

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 transform">
      <div className="rounded-md bg-black text-white px-4 py-2 text-sm shadow-md">
        {message}
        <button onClick={onClose} className="ml-3 underline">OK</button>
      </div>
    </div>
  );
}