'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed',
          // Variants
          variant === 'default' && 'bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--card-border)] border border-[var(--card-border)]',
          variant === 'ghost' && 'bg-transparent hover:bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]',
          variant === 'outline' && 'bg-transparent border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--card)] hover:border-[var(--muted)]',
          variant === 'accent' && 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white hover:opacity-90 shadow-lg shadow-[var(--accent)]/20',
          // Sizes
          size === 'sm' && 'h-8 px-3 text-xs rounded-md gap-1.5',
          size === 'md' && 'h-10 px-4 text-sm rounded-lg gap-2',
          size === 'lg' && 'h-12 px-6 text-base rounded-lg gap-2',
          size === 'icon' && 'h-10 w-10 rounded-lg',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
