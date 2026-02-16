import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "gradient";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  gradient: "btn btn-gradient",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, asChild = false, variant = "primary", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(variantClassMap[variant], className)} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button };
