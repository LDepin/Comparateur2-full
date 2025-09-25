// src/app/components/ui/Card.tsx
"use client";
import React from "react";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: React.ElementType;
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className = "", as: Comp = "div", ...rest },
  ref
) {
  return (
    <Comp
      ref={ref as any}
      className={`card p-3 ${className}`}
      {...rest}
    >
      {children}
    </Comp>
  );
});

export default Card;