// src/app/components/ui/Card.tsx
"use client";
import * as React from "react";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className = "", ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={`card p-3 ${className}`}
      {...props}
    />
  );
});

export default Card;