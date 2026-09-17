/** Formatting for the domain-adaptive dashboard's metric band. */

export function formatMetricValue(value: number, format: "count" | "percent" | "currency" | "duration"): string {
  switch (format) {
    case "percent":
      return `${Math.round(value * 100)}%`;
    case "currency":
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
    case "duration": {
      const m = Math.floor(value / 60);
      const s = Math.floor(value % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    case "count":
    default:
      return new Intl.NumberFormat("en-GB").format(value);
  }
}
