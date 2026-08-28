/**
 * Wortbildmarke des Rentenplaners: drei aufsteigende Balken mit einer
 * Trendlinie darueber. Uebernommen aus dem urspruenglichen Entwurf.
 */
export function Logo({ klasse = 'h-10 w-10' }: { klasse?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${klasse}`}
      role="img"
      aria-label="JS-Rentenplaner"
    >
      <rect x="15" y="60" width="16" height="25" rx="4" fill="#94A3B8" />
      <rect x="42" y="40" width="16" height="45" rx="4" fill="#64748B" />
      <rect x="69" y="20" width="16" height="65" rx="4" fill="#1E40AF" />
      <path
        d="M10 50 L40 30 L60 40 L85 10"
        stroke="#10B981"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="85" cy="10" r="8" fill="#10B981" />
    </svg>
  );
}
