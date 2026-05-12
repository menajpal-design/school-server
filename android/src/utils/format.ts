export function titleize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

export function summarize(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return "No entries";
    return value.slice(0, 4).map((item) => summarize(item, depth + 1)).join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["_id", "__v", "password"].includes(key))
      .slice(0, depth > 1 ? 4 : 8);
    return entries.map(([key, item]) => `${titleize(key)}: ${summarize(item, depth + 1)}`).join(", ");
  }
  return String(value);
}

export function extractList(data: any): any[] {
  if (Array.isArray(data)) return data;
  const arrayEntry = Object.values(data || {}).find(Array.isArray);
  return Array.isArray(arrayEntry) ? arrayEntry : [];
}

export function listItems(data: any, fallbackTitle: string) {
  const list = extractList(data);
  if (list.length) {
    return list.map((item: any, index) => ({
      title: item.name || item.title || item.fileName || item.cardNumber || item.receiptNumber || item.email || `${fallbackTitle} ${index + 1}`,
      subtitle: summarize(item),
      meta: item.role || item.status || item.category || item.type
    }));
  }
  return Object.entries(data || {}).map(([key, value]) => ({ title: titleize(key), subtitle: summarize(value) }));
}
