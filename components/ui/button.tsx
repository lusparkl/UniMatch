import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const variants = cva(
  "btn inline-flex items-center justify-center gap-2 rounded-[4px] font-semibold whitespace-nowrap transition-colors no-underline hover:no-underline disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] hover:text-white",
        outline:
          "border border-[var(--border-strong)] bg-white text-[var(--fg-1)] hover:bg-[var(--neutral-900)] hover:text-white",
        dark: "bg-[var(--neutral-900)] text-white hover:bg-[var(--neutral-700)] hover:text-white",
        light: "bg-white text-[var(--brand)] hover:bg-[var(--crimson-50)]",
        ghost:
          "bg-transparent text-[var(--brand)] hover:bg-[var(--crimson-50)] hover:text-[var(--brand-hover)]",
      },
      size: { default: "h-11 px-6 text-[15px]", sm: "h-9 px-4 text-sm" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={twMerge(clsx(variants({ variant, size }), className))}
      {...props}
    />
  );
}
