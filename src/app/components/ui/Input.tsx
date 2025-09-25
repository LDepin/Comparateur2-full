// src/app/components/ui/Input.tsx
"use client";
import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      {...rest}
    />
  );
});

export default Input;