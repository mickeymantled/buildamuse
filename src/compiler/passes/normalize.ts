// Text normalization used by the dedupe pass to compare lines.
// Lowercase, trim, collapse internal whitespace to single spaces, drop one trailing period.

export function normalize(text: string): string {
  const collapsed = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return collapsed.endsWith('.') ? collapsed.slice(0, -1) : collapsed;
}
