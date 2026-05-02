"use client";

import { cn } from "@/lib/utils";

type IconProps = { className?: string };

/** Mozaic / vitrină — toate stările */
export function StareToateIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4.5 4.5h6a1.25 1.25 0 0 1 1.25 1.25V11a1.25 1.25 0 0 1-1.25 1.25h-6A1.25 1.25 0 0 1 3.25 11V5.75A1.25 1.25 0 0 1 4.5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 4.5h5a1.25 1.25 0 0 1 1.25 1.25V9.5A1.25 1.25 0 0 1 19.5 10.75h-5A1.25 1.25 0 0 1 13.25 9.5V5.75A1.25 1.25 0 0 1 14.5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 15.5h5a1.25 1.25 0 0 1 1.25 1.25v2.5A1.25 1.25 0 0 1 9.5 20.5h-5A1.25 1.25 0 0 1 3.25 19.25v-2.5A1.25 1.25 0 0 1 4.5 15.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 12.5h6.5A1.25 1.25 0 0 1 20.25 13.75V19a1.25 1.25 0 0 1-1.25 1.25H12.5A1.25 1.25 0 0 1 11.25 19v-5.25a1.25 1.25 0 0 1 1.25-1.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Stea în cerc — “nou, premium” (nu generic Lucide) */
export function StareNouIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 5.8l1.1 2.1 2.1.1-1.5 1.4.5 1.8-2.1-1-2.1 1 .4-1.8-1.4-1.3 2-.2 1-2.1Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Etichetă de preț — “second-hand / revânzare” (SVG curat) */
export function StareFolositIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 8.5 L8.8 3.4 H12.2 L17.8 5.6 V7.4 L10.2 20.4 L4 8.5 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7.1" cy="4.5" r="0.7" fill="currentColor" />
      <path d="M8.8 5.2h1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Cadou stilizat (Preț — gratuit) */
export function FiltreCadouIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="3.5"
        y="9.5"
        width="17"
        height="11.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 9.5V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M3.5 14.5h17M12 3.5a3.2 3.2 0 0 0-1.1 2.1c0 1.3 1.1 1.4 1.1 1.4s1.1-.1 1.1-1.4A3.2 3.2 0 0 0 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 5.1h2.1c.7 0 1.2.4 1.2 1.1v.6M16.5 5.1h-1.1c-1.1 0-1.5.3-1.5 1.1v.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Min ↔ max: [ ] + axă dublu sens */
export function FiltreIntervalPretIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M1.5 5.5H2.5M1.5 5.5V18.5M1.5 18.5H2.5M22.5 5.5H21.5M22.5 5.5V18.5M22.5 18.5H21.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.88"
      />
      <path
        d="M5.5 12H18.2M5.5 12l.9-.9M5.5 12l.9.9M18.2 12l-.9-.9M18.2 12l-.9.9"
        stroke="currentColor"
        strokeWidth="1.05"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

export { FiltreIntervalPretIcon as ArrowLeftRight };
