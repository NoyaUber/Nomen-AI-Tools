import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle, X } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const variants = {
      primary:
        'bg-[#7C6CC4] text-[#F8F7FC] hover:bg-[#6D5DB6] border border-[#9484DA]/40 shadow-xs',
      secondary:
        'bg-[#171C2B] text-[#E4E1EE] hover:bg-[#1F263A] border border-[#262D42]',
      outline:
        'bg-transparent text-[#D0CCE0] hover:bg-[#161B28] hover:text-[#F3F1FA] border border-[#283046]',
      ghost:
        'bg-transparent text-[#A39EBA] hover:bg-[#161B28] hover:text-[#ECEAF2] border border-transparent',
      danger:
        'bg-[#3A1820] text-[#FCA5A5] hover:bg-[#4D1E29] border border-[#7F1D1D]/60',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs font-medium rounded-md',
      md: 'px-4 py-2 text-sm font-medium rounded-lg',
      lg: 'px-5 py-2.5 text-sm font-semibold rounded-lg',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B7EC8] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
          variants[variant],
          sizes[size],
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

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full px-3.5 py-2 text-sm bg-[#0D1018] text-[#ECEAF2] placeholder-[#68647D] border border-[#23293B] rounded-lg focus:outline-none focus:border-[#8B7EC8] transition-colors',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full px-3.5 py-2.5 text-sm bg-[#0D1018] text-[#ECEAF2] placeholder-[#68647D] border border-[#23293B] rounded-lg focus:outline-none focus:border-[#8B7EC8] transition-colors leading-relaxed',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'w-full px-3.5 py-2 text-sm bg-[#0D1018] text-[#ECEAF2] border border-[#23293B] rounded-lg focus:outline-none focus:border-[#8B7EC8] transition-colors',
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function FieldLabel({
  label,
  required,
  hint,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#C5C1D6]">
        {label}
        {required && <span className="text-[#C4B5FD] ml-1">*</span>}
      </label>
      {hint && <span className="text-[11px] text-[#736E8A]">{hint}</span>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full bg-[#111520] border border-[#262D42] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]',
          maxWidth
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#1E2436]">
          <div>
            <h2 className="text-xl font-semibold text-[#F3F1FA] font-serif-display tracking-wide">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#8E89A6] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#8E89A6] hover:text-[#ECEAF2] rounded-lg hover:bg-[#1A2030] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 text-sm text-[#D0CCE0]">
          <AlertTriangle className="w-5 h-5 text-[#F87171] shrink-0 mt-0.5" />
          <p className="leading-relaxed">{description}</p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E2436]">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting...' : 'Confirm Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="p-10 text-center bg-[#111520] border border-[#1E2436] rounded-xl max-w-xl mx-auto my-6">
      <h3 className="text-xl font-semibold text-[#F3F1FA] font-serif-display">{title}</h3>
      <p className="text-sm text-[#8E89A6] mt-2 leading-relaxed">{description}</p>
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {actionLabel && onAction && (
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
