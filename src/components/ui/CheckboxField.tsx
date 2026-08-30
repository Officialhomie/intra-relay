import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  error?: string;
}

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  function CheckboxField({ label, error, id, className, ...props }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const errorId = `${fieldId}-error`;

    return (
      <div className="space-y-1.5">
        <div className="flex items-start gap-2.5">
          <input
            ref={ref}
            id={fieldId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn("mt-0.5 size-4 shrink-0", className)}
            {...props}
          />
          <label htmlFor={fieldId} className="text-sm">
            {label}
          </label>
        </div>
        {error ? (
          <p id={errorId} className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
