/**
 * Generate a readable, URL-safe business slug (FR-SUP-004).
 * Deterministic and side-effect free.
 *
 * `NFKD` normalisation splits accented letters into base + combining mark;
 * the non-alphanumeric pass then drops the marks, so "Café" -> "cafe".
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
