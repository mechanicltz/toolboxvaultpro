// Small ISO datetime formatter
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${date}  ·  ${time}`;
  } catch {
    return iso;
  }
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
