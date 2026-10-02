import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "quiet" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg",
  ghost: "border border-border bg-surface-2 text-fg",
  quiet: "bg-transparent text-fg",
  danger: "bg-transparent text-danger",
};

export function buttonClass(variant: Variant = "ghost", className?: string) {
  return cn(
    "press inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium",
    "transition-opacity duration-150 ease-out",
    "hover:opacity-90 disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    styles[variant],
    className,
  );
}

export function Button({
  variant = "ghost",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
