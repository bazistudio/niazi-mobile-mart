import React, { forwardRef } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline' | 'flat' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, variant = 'default', padding = 'md', className = '', ...props }, ref) => {
    const baseCardStyles = 'bg-surface text-text-primary rounded-md transition-all duration-normal ease-standard';

    const variantStyles = {
      default: 'border border-border shadow-sm',
      outline: 'border border-border shadow-none',
      flat: 'bg-surface-hover border border-transparent shadow-none',
      interactive: 'border border-border shadow-sm hover:shadow-md hover:border-primary/50 cursor-pointer active:scale-[0.995]',
    };

    const paddingStyles = {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4 sm:p-6',
      lg: 'p-6 sm:p-8',
    };

    return (
      <div
        ref={ref}
        className={`${baseCardStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
