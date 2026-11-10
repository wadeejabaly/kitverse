"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { button, cx } from "./ui";

/**
 * A form's submit button with a loading state (admin redesign 2026-11-10):
 * disabled and spinning while the server action runs, so a slow save can't
 * be double-submitted and the owner can see something is happening.
 */
export function SubmitButton({ children, variant = "primary", bare = false, className, pendingText, ...rest }: {
  children: React.ReactNode; variant?: keyof typeof button; className?: string; pendingText?: string;
  /** Use `className` as the whole style (for buttons that already build it from `button.*`). */
  bare?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className">) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending || rest.disabled} aria-busy={pending} className={bare ? className : cx(button[variant], className)}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
