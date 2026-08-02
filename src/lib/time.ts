// Formateo de fechas en español (pure module, sin dependencias de servidor).
// - formatRelativeTime: "hace 3 horas" (meta de tarjetas y detalle).
// - formatDateLong: "domingo, 2 de agosto de 2026" (tasa BCV, footer).

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} minuto${minutes === 1 ? "" : "s"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? "" : "s"}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? "" : "s"}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? "" : "es"}`;

  const years = Math.floor(months / 12);
  return `hace ${years} año${years === 1 ? "" : "s"}`;
}

export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
