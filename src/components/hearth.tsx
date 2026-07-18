// Hearth Design System — React component library (TSX port of the handoff).
// CSS lives in src/index.css (bundled), so these are pure markup + behaviour.

import {
  type ReactNode, type ReactElement, type ElementType,
  isValidElement, cloneElement, useMemo,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes,
  type SelectHTMLAttributes, type HTMLAttributes,
} from 'react';

/* ── Lucide-style stroke icons (inline, 24 viewBox, currentColor) ───────────── */
export function Ic({ d, size = 20 }: { d: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- icon data lives beside its <Ic> renderer in this library module
export const icons: Record<string, ReactNode> = {
  home: <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 14 3-3 3 3 5-6" /></>,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  dots: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
};

type Option = { value: string; label: string; disabled?: boolean };
const asOption = (o: Option | string): Option => (typeof o === 'string' ? { value: o, label: o } : o);
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/* ── Button ─────────────────────────────────────────────────────────────────── */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  as?: 'button' | 'a';
}
export function Button({
  variant = 'primary', size = 'md', fullWidth = false, loading = false, disabled = false,
  iconStart = null, iconEnd = null, as = 'button', className = '', children, ...rest
}: ButtonProps) {
  const Tag = as as 'button';
  const isDisabled = disabled || loading;
  return (
    <Tag
      className={cx('hearth-btn', `hearth-btn--${variant}`, size !== 'md' && `hearth-btn--${size}`, fullWidth && 'hearth-btn--full', className)}
      disabled={as === 'button' ? isDisabled : undefined}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="hearth-btn__spin" aria-hidden="true" /> : iconStart}
      {children}
      {!loading && iconEnd}
    </Tag>
  );
}

/* ── IconButton ─────────────────────────────────────────────────────────────── */
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'ghost' | 'solid';
  size?: 'sm' | 'md';
}
export function IconButton({ label, variant = 'ghost', size = 'md', disabled = false, className = '', children, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled}
      className={cx('hearth-iconbtn', variant === 'solid' && 'hearth-iconbtn--solid', size === 'sm' && 'hearth-iconbtn--sm', className)}
      {...rest}>
      {children}
    </button>
  );
}

/* ── Input ──────────────────────────────────────────────────────────────────── */
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}
export function Input({ size = 'md', invalid = false, className = '', type = 'text', ...rest }: InputProps) {
  return <input type={type} aria-invalid={invalid || undefined}
    className={cx('hearth-input', size !== 'md' && `hearth-input--${size}`, className)} {...rest} />;
}

/* ── Textarea ───────────────────────────────────────────────────────────────── */
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean; }
export function Textarea({ invalid = false, rows = 4, className = '', ...rest }: TextareaProps) {
  return <textarea rows={rows} aria-invalid={invalid || undefined}
    className={cx('hearth-textarea', className)} {...rest} />;
}

/* ── Select ─────────────────────────────────────────────────────────────────── */
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options?: (Option | string)[];
  placeholder?: string;
  invalid?: boolean;
}
export function Select({ options = [], value, onChange, placeholder, invalid = false, disabled = false, className = '', ...rest }: SelectProps) {
  return (
    <div className={cx('hearth-select', className)} aria-invalid={invalid || undefined}>
      <select value={value} onChange={onChange} disabled={disabled} {...rest}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(asOption).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg className="hearth-select__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </div>
  );
}

/* ── Checkbox ───────────────────────────────────────────────────────────────── */
interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label?: ReactNode; }
export function Checkbox({ label, checked, onChange, disabled = false, className = '', ...rest }: CheckboxProps) {
  return (
    <label className={cx('hearth-check', disabled && 'hearth-check--disabled', className)}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} {...rest} />
      <span className="hearth-check__box" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

/* ── RadioGroup ─────────────────────────────────────────────────────────────── */
interface RadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  options?: (Option | string)[];
}
export function RadioGroup({ name, value, onChange, options = [], className = '', ...rest }: RadioGroupProps) {
  return (
    <div role="radiogroup" className={cx('hearth-radio-group', className)} {...rest}>
      {options.map(asOption).map((o) => (
        <label key={o.value} className="hearth-radio">
          <input type="radio" name={name} value={o.value} checked={value === o.value}
            onChange={() => onChange && onChange(o.value)} disabled={o.disabled} />
          <span className="hearth-radio__dot" aria-hidden="true" />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/* ── Switch ─────────────────────────────────────────────────────────────────── */
interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label?: ReactNode; }
export function Switch({ label, checked, onChange, disabled = false, className = '', ...rest }: SwitchProps) {
  return (
    <label className={cx('hearth-switch', disabled && 'hearth-switch--disabled', className)}>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} {...rest} />
      <span className="hearth-switch__track" aria-hidden="true" />
      {label && <span>{label}</span>}
    </label>
  );
}

/* ── Field ──────────────────────────────────────────────────────────────────── */
let fid = 0;
interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}
export function Field({ label, htmlFor, required = false, helper, error, className = '', children }: FieldProps) {
  const genId = useMemo(() => htmlFor || `hearth-field-${++fid}`, [htmlFor]);
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: genId,
        invalid: !!error || (children as ReactElement<{ invalid?: boolean }>).props.invalid,
        'aria-describedby': (helper || error) ? `${genId}-help` : undefined,
      })
    : children;
  return (
    <div className={cx('hearth-field', className)}>
      {label && <label className="hearth-field__label" htmlFor={genId}>{label}{required && <span className="hearth-field__req" aria-hidden="true">*</span>}</label>}
      {child}
      {(error || helper) && (
        <span id={`${genId}-help`} className={cx('hearth-field__help', !!error && 'hearth-field__help--error')}>
          {error && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>}
          {error || helper}
        </span>
      )}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────────────── */
type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> { tone?: Tone; dot?: boolean; }
export function Badge({ tone = 'neutral', dot = false, className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={cx('hearth-badge', `hearth-badge--${tone}`, className)} {...rest}>
      {dot && <span className="hearth-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ── Tag ────────────────────────────────────────────────────────────────────── */
interface TagProps extends HTMLAttributes<HTMLSpanElement> { onRemove?: () => void; }
export function Tag({ onRemove, className = '', children, ...rest }: TagProps) {
  return (
    <span className={cx('hearth-tag', className)} {...rest}>
      {children}
      {onRemove && (
        <button type="button" className="hearth-tag__x" aria-label="Remove" onClick={onRemove}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </span>
  );
}

/* ── Callout ────────────────────────────────────────────────────────────────── */
const CALLOUT_ICONS: Record<Tone, ReactNode> = {
  info: <path d="M12 16v-4m0-4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
  success: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-10 2 2 4-4" />,
  warning: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01" />,
  error: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM15 9l-6 6m0-6 6 6" />,
  neutral: <path d="M12 16v-4m0-4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
  accent: <path d="M12 16v-4m0-4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
};
interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> { tone?: 'info' | 'success' | 'warning' | 'error'; title?: ReactNode; }
export function Callout({ tone = 'info', title, className = '', children, ...rest }: CalloutProps) {
  return (
    <div role="note" className={cx('hearth-callout', `hearth-callout--${tone}`, className)} {...rest}>
      <span className="hearth-callout__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{CALLOUT_ICONS[tone]}</svg>
      </span>
      <div className="hearth-callout__body">
        {title && <span className="hearth-callout__title">{title}</span>}
        {typeof children === 'string' ? <p>{children}</p> : children}
      </div>
    </div>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────────── */
let tid = 0;
interface TooltipProps extends HTMLAttributes<HTMLSpanElement> { label: ReactNode; children: ReactNode; }
export function Tooltip({ label, className = '', children, ...rest }: TooltipProps) {
  const id = useMemo(() => `hearth-tip-${++tid}`, []);
  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-describedby': id })
    : children;
  return (
    <span className={cx('hearth-tip', className)} {...rest}>
      {trigger}
      <span className="hearth-tip__pop" role="tooltip" id={id}>{label}</span>
    </span>
  );
}

/* ── Card ───────────────────────────────────────────────────────────────────── */
interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  elevation?: 'flat' | 'raised';
  onClick?: () => void;
  padded?: boolean;
}
export function Card({ title, description, footer, elevation = 'flat', onClick, padded, className = '', children, ...rest }: CardProps) {
  const interactive = !!onClick;
  const Tag: ElementType = interactive ? 'button' : 'div';
  const hasHeader = title || description;
  const usePad = padded && !hasHeader && !footer;
  return (
    <Tag
      className={cx('hearth-card', elevation === 'raised' && 'hearth-card--raised', interactive && 'hearth-card--interactive', usePad && 'hearth-card--pad', className)}
      onClick={onClick} type={interactive ? 'button' : undefined} {...rest}
    >
      {hasHeader && (
        <div className="hearth-card__header">
          {title && <span className="hearth-card__title">{title}</span>}
          {description && <span className="hearth-card__desc">{description}</span>}
        </div>
      )}
      {children != null && (usePad ? children : <div className="hearth-card__body">{children}</div>)}
      {footer && <div className="hearth-card__footer">{footer}</div>}
    </Tag>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────────── */
type Tab = { value: string; label: string; count?: number };
interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs?: (Tab | string)[];
  value?: string;
  onChange?: (value: string) => void;
}
export function Tabs({ tabs = [], value, onChange, className = '', ...rest }: TabsProps) {
  return (
    <div role="tablist" className={cx('hearth-tabs', className)} {...rest}>
      {tabs.map((t) => {
        const tab: Tab = typeof t === 'string' ? { value: t, label: t } : t;
        return (
          <button key={tab.value} role="tab" type="button" aria-selected={value === tab.value}
            className="hearth-tab" onClick={() => onChange && onChange(tab.value)}>
            {tab.label}
            {tab.count != null && <span className="hearth-tab__count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
