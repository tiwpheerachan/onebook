'use client';
import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * ชุดคอมโพเนนต์จัดวางฟอร์ม (แนวเดียวกับ shadcn/field)
 * ปรับให้ทำงานกับ Tailwind v3 และโทเคนสีของ ONEBOOK (ink/sea) โดยไม่พึ่ง Radix
 */

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return <fieldset data-slot="field-set" className={cn('flex flex-col gap-6', className)} {...props} />;
}

function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn('mb-3 font-medium text-ink-900', variant === 'legend' ? 'text-base' : 'text-sm', className)}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn('group/field-group flex w-full flex-col gap-5', className)}
      {...props}
    />
  );
}

const fieldOrientation = {
  vertical: 'flex-col [&>*]:w-full [&>.sr-only]:w-auto',
  horizontal: 'flex-row items-center [&>[data-slot=field-label]]:flex-auto',
} as const;

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & { orientation?: keyof typeof fieldOrientation }) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        'group/field flex w-full gap-2 data-[invalid=true]:text-rose-600',
        fieldOrientation[orientation],
        className
      )}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="field-content" className={cn('flex flex-1 flex-col gap-1.5 leading-snug', className)} {...props} />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="field-label"
      className={cn(
        'flex w-fit gap-2 text-xs font-medium leading-snug text-ink-600',
        'group-data-[disabled=true]/field:opacity-50',
        className
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-title"
      className={cn('flex w-fit items-center gap-2 text-sm font-medium leading-snug text-ink-900', className)}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'text-xs font-normal leading-normal text-ink-500',
        '[&>a]:font-medium [&>a]:text-sea-700 [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-sea-900',
        className
      )}
      {...props}
    />
  );
}

function FieldSeparator({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn('relative -my-1 h-5 text-xs', className)}
      {...props}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-ink-200" />
      {children && (
        <span
          data-slot="field-separator-content"
          className="relative mx-auto block w-fit bg-white px-3 text-ink-400"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<'div'> & { errors?: Array<{ message?: string } | undefined> }) {
  const content = React.useMemo(() => {
    if (children) return children;
    if (!errors?.length) return null;
    if (errors.length === 1 && errors[0]?.message) return errors[0].message;
    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {errors.map((error, i) => error?.message && <li key={i}>{error.message}</li>)}
      </ul>
    );
  }, [children, errors]);

  if (!content) return null;

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn(
        'flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-normal text-rose-700 ring-1 ring-inset ring-rose-200',
        className
      )}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
