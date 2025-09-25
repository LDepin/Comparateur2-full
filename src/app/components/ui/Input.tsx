// src/app/components/ui/Input.tsx
"use client";
import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Input stylé, compatible ref (forwardRef) pour permettre les:
 * - focus programmatique (ex: dateInputRef.current?.focus())
 * - validations natives
 */
const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
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