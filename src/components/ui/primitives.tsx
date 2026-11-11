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
        'bg-gradient-to-b from-[#D4AF37] to-[#B8860B] text-[#12100E] font-semibold hover:from-[#E5C158] hover:to-[#C9971C] border border-[#F3E5AB]/40 shadow-sm active:scale-[0.98]',
      secondary:
        'bg-[#241E18] text-[#F5EFE6] hover:bg-[#2F2720] hover:border-[#D4AF37]/40 border border-[#382F26] active:scale-[0.98]',
      outline:
        'bg-[#1A1612]/70 text-[#E6DEC8] hover:bg-[#26201A] hover:text-[#F7F2E9] hover:border-[#D4AF37]/50 border border-[#3A3026] active:scale-[0.98]',
      ghost:
        'bg-transparent text-[#C8BFA8] hover:bg-[#241E18] hover:text-[#F7F2E9] border border-transparent',
      danger:
        'bg-[#3A1818] text-[#FECACA] hover:bg-[#4F1F1F] border border-[#991B1B]/60 active:scale-[0.98]',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs font-medium rounded-lg',
      md: 'px-4 py-2 text-sm font-medium rounded-lg',
      lg: 'px-5 py-2.5 text-sm font-semibold rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
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
      'w-full px-3.5 py-2 text-sm bg-[#14110E] text-[#F7F2E9] placeholder-[#7D7262] border border-[#332B22] rounded-lg focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-all',
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
      'w-full px-3.5 py-2.5 text-sm bg-[#14110E] text-[#F7F2E9] placeholder-[#7D7262] border border-[#332B22] rounded-lg focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-all leading-relaxed',
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
      'w-full px-3.5 py-2 text-sm bg-[#14110E] text-[#F7F2E9] border border-[#332B22] rounded-lg focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-all',
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
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#DED5C0]">
        {label}
        {required && <span className="text-[#D4AF37] ml-1">*</span>}
      </label>
      {hint && <span className="text-[11px] text-[#948975]">{hint}</span>}
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full bg-[#1C1814] border border-[#3A3026] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]',
          maxWidth
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#2E2720] bg-[#161310]">
          <div>
            <h2 className="text-xl font-semibold text-[#F7F2E9] font-serif-display tracking-wide">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#A89D88] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#A89D88] hover:text-[#F7F2E9] rounded-lg hover:bg-[#26201A] transition-colors cursor-pointer"
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
        <div className="flex items-start gap-3 text-sm text-[#E6DEC8]">
          <AlertTriangle className="w-5 h-5 text-[#F87171] shrink-0 mt-0.5" />
          <p className="leading-relaxed">{description}</p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2E2720]">
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
    <div className="p-10 text-center bg-[#1C1814] border border-[#2E2720] rounded-xl max-w-xl mx-auto my-6 shadow-lg">
      <h3 className="text-xl font-semibold text-[#F7F2E9] font-serif-display">{title}</h3>
      <p className="text-sm text-[#A89D88] mt-2 leading-relaxed">{description}</p>
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
