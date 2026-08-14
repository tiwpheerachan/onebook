import * as React from 'react';
import { cn } from '@/lib/cn';

const variants = {
  default: 'bg-sea-900 text-white hover:bg-sea-800 focus-visible:ring-sea-300',
  secondary: 'bg-sea-50 text-sea-900 hover:bg-sea-100 focus-visible:ring-sea-200',
  outline: 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 focus-visible:ring-ink-200',
  ghost: 'text-ink-600 hover:bg-ink-100 focus-visible:ring-ink-200',
  destructive: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-300',
  link: 'text-sea-700 underline-offset-4 hover:underline',
} as const;

const sizes = {
  default: 'h-11 px-4 py-2',
  sm: 'h-9 px-3',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

/** ปุ่มมาตรฐาน ใช้โทนสีจากโลโก้ (sea) */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';

export { Button, variants as buttonVariants };
