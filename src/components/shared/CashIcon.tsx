/** A banknote, drawn inline (nothing to license) - the "pay cash on delivery" mark. */
export function CashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </svg>
  );
}
