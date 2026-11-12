import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
// Pill actions from the design system: hover darkens fills or inverts outlines to ink, press scales to 0.97.
const variants = cva(
  "btn inline-flex items-center justify-center gap-2 rounded-full border font-medium tracking-[0.01em] leading-none whitespace-nowrap no-underline hover:no-underline transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(.22,.61,.36,1)] active:scale-[.97] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] hover:text-white",
        outline:
          "border-[var(--neutral-900)] bg-transparent text-[var(--fg-1)] hover:bg-[var(--neutral-900)] hover:text-white",
        dark: "border-transparent bg-[var(--neutral-900)] text-white hover:bg-[var(--neutral-700)] hover:text-white",
        light:
          "border-transparent bg-white text-[var(--brand)] hover:bg-[var(--neutral-100)] hover:text-[var(--brand)]",
        ghost:
          "border-transparent bg-transparent text-[var(--brand)] hover:bg-[var(--crimson-50)] hover:text-[var(--brand-hover)]",
        link: "h-auto rounded-none border-0 border-b border-current bg-transparent px-0 pt-0.5 pb-0.5 text-inherit hover:pb-1 active:scale-100",
      },
      size: {
        default: "h-[42px] px-[22px] text-sm",
        sm: "h-[34px] px-4 text-[13px]",
        lg: "h-[50px] px-7 text-[15px]",
      },
    },
    compoundVariants: [
      { variant: "link", size: "default", className: "h-auto px-0" },
      { variant: "link", size: "sm", className: "h-auto px-0" },
    ],
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
/** A round outline button holding one icon; `label` names it for screen readers. */
export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={twMerge(
        "icon-btn inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-[var(--border-2)] bg-transparent p-0 text-[var(--fg-1)] transition-colors duration-150 hover:bg-[var(--neutral-900)] hover:text-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--fg-1)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
