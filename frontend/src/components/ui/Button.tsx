import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base styles: tokenized background, border, text, focus, motion
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-md transition-all duration-fast ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-disabled disabled:pointer-events-none select-none';

    // Size variants
    const sizeStyles = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2.5',
    };

    // Variant styles resolving strictly to semantic design tokens
    const variantStyles = {
      primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active shadow-sm',
      secondary: 'bg-secondary text-white hover:bg-secondary/90 active:bg-secondary/80 shadow-sm',
      outline: 'bg-surface text-text-primary border border-border hover:bg-surface-hover active:bg-border/30',
      ghost: 'bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-border/20',
      danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow-sm',
    };

    const combinedClasses = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`.trim();

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={combinedClasses}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: React.ReactNode;
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'md', className = '', ...props }, ref) => {
    const iconSizeStyles = {
      sm: 'w-8 h-8 p-0',
      md: 'w-10 h-10 p-0',
      lg: 'w-12 h-12 p-0',
    };

    return (
      <Button
        ref={ref}
        size={size}
        className={`${iconSizeStyles[size]} ${className}`}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';
