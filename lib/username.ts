// A friendly URL handle from a child's name: first initial + last name.
// "Prithvi Aiyer" → "paiyer". A single name → that name. Letters/digits only.
export function usernameFrom(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let base =
    parts.length >= 2 ? parts[0][0] + parts[parts.length - 1] : parts[0] || "student";
  base = base.replace(/[^a-z0-9]/g, "");
  return base || "student";
}
