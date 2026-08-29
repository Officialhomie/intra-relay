import type { Config } from "tailwindcss";

/**
 * The design system lives in `src/styles/tokens.css` as CSS variables; this
 * config maps them onto Tailwind utilities. "calm clinic" — see that file.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-accent": "var(--color-surface-accent)",
        sage: "var(--color-sage)",
        mist: "var(--color-mist)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        foreground: "var(--color-text)",
        muted: "var(--color-text-muted)",
        subtle: "var(--color-text-subtle)",
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        "primary-contrast": "var(--color-primary-contrast)",
        "primary-wash": "var(--color-primary-wash)",
        success: "var(--color-success)",
        "success-wash": "var(--color-success-wash)",
        warning: "var(--color-warning)",
        "warning-wash": "var(--color-warning-wash)",
        danger: "var(--color-danger)",
        "danger-wash": "var(--color-danger-wash)",
        info: "var(--color-info)",
        "info-wash": "var(--color-info-wash)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        serif: "var(--font-serif)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "var(--leading-normal)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--leading-normal)" }],
        base: ["var(--text-base)", { lineHeight: "var(--leading-normal)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--leading-snug)" }],
        xl: ["var(--text-xl)", { lineHeight: "var(--leading-snug)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "var(--leading-tight)" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "var(--leading-tight)" }],
      },
      letterSpacing: {
        tight: "var(--tracking-tight)",
        normal: "var(--tracking-normal)",
        wide: "var(--tracking-wide)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
      maxWidth: {
        container: "var(--container-max)",
      },
    },
  },
  plugins: [],
};

export default config;
