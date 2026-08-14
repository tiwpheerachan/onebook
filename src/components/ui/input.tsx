import * as React from 'react';
import { cn } from '@/lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** อินพุตมาตรฐาน (โทเคนสีเดียวกับคลาส .input ใน globals.css) */
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2 text-sm text-ink-900 transition',
      'placeholder:text-ink-400 outline-none',
      'focus:border-sea-600 focus:ring-2 focus:ring-sea-100',
      'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
      'aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-100',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
