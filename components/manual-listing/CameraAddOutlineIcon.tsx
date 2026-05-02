/** Cameră + plus, stil line-art (stroke), pentru zona de încărcare imagini. */
export function CameraAddOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="9.5" width="13" height="9" rx="2" />
        <rect x="3.5" y="7.25" width="4" height="2.25" rx="0.5" />
        <circle cx="10" cy="14" r="2.5" />
        <path d="M17.5 4.5v4M15.5 6.5h4" />
      </g>
    </svg>
  );
}
