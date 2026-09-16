/** `#RRGGBB` in upper case for `#abc`, `abc`, `#aabbcc`, or `aabbcc`; null for anything else. */
export function normalizeHex (input: string): string | null {
  const m = /^\s*#?([0-9a-f]{3}|[0-9a-f]{6})\s*$/i.exec(input);
  if (!m) return null;
  const h = m[1]!;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return `#${full.toUpperCase()}`;
}
