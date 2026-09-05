import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, disabled, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const baseInputStyles =
      'w-full h-10 px-3 text-sm bg-surface text-text-primary placeholder-text-muted border border-border rounded-md transition-all duration-fast ease-standard focus:outline-none focus:border-primary focus:ring-2 focus:ring-focus-ring disabled:bg-surface-hover disabled:text-text-muted disabled:opacity-disabled disabled:cursor-not-allowed';

    const errorInputStyles = error
      ? 'border-danger focus:border-danger focus:ring-danger/20'
      : '';

    const iconPaddingStyles = `${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''}`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-secondary select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {leftIcon && (
            <div className="absolute left-3 pointer-events-none text-text-muted flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`${baseInputStyles} ${errorInputStyles} ${iconPaddingStyles} ${className}`.trim()}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 pointer-events-none text-text-muted flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <span className="text-xs font-medium text-danger">{error}</span>
        ) : helperText ? (
          <span className="text-xs text-text-muted">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
