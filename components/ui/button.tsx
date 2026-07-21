import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva("inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50", { variants: { variant: { default: "bg-slate-900 text-white hover:bg-slate-800", outline: "border bg-white hover:bg-slate-50", ghost: "hover:bg-slate-100", destructive: "bg-red-600 text-white hover:bg-red-500" }, size: { default: "h-10 px-4 py-2", sm: "h-9 rounded-md px-3", icon: "h-10 w-10" } }, defaultVariants: { variant: "default", size: "default" } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(variants({ variant, size }), className)} {...props} />); Button.displayName="Button";
