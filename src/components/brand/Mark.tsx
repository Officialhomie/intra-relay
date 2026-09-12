/**
 * The Intra app mark — two nodes and the line between them: a request handed
 * from one party to another. One filled node (solved), one outlined node
 * (open), joined by a single line. Nothing moves until the line is drawn.
 */
interface MarkProps {
  size?: number;
  className?: string;
  /** "ink" draws on a light ground; "reversed" draws linen-on-ink for dark tiles (the app icon, the footer). */
  variant?: "ink" | "reversed";
}

export function Mark({ size = 24, className, variant = "ink" }: MarkProps) {
  const stroke = variant === "ink" ? "currentColor" : "#faf9f5";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      style={{ color: variant === "ink" ? undefined : stroke }}
    >
      <circle cx="9.5" cy="16" r="4.5" fill={stroke} />
      <circle cx="22.5" cy="16" r="4.5" fill="none" stroke={stroke} strokeWidth="2.2" />
      <line x1="14" y1="16" x2="18" y2="16" stroke={stroke} strokeWidth="2.2" />
    </svg>
  );
}
