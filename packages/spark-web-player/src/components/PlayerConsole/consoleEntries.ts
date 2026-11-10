export type ConsoleSeverity = "error" | "warning" | "info";

export const CONSOLE_SEVERITIES: readonly ConsoleSeverity[] = [
  "error",
  "warning",
  "info",
];

export interface ConsoleJump {
  path: string;
  line: number;
}

export interface ConsoleEntry {
  severity: ConsoleSeverity;
  message: string;
  title?: string;
  path?: string;
  line?: number;
  time?: number;
}

const pad = (value: number) => String(value).padStart(2, "0");

export const formatConsoleTime = (time: number) => {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const consoleLocation = (entry: { path?: string; line?: number }) =>
  entry.path ? (entry.line != null ? `${entry.path}:${entry.line}` : entry.path) : "";

export const formatConsoleStamp = (time: number) =>
  new Date(time).toISOString();

export const formatConsoleEntry = (entry: ConsoleEntry) =>
  [
    `${entry.time != null ? `[${formatConsoleStamp(entry.time)}] ` : ""}${entry.severity.toUpperCase()} · ${entry.title ?? entry.message}`,
    entry.title ? entry.message : "",
    consoleLocation(entry),
  ]
    .filter(Boolean)
    .join("\n");

export const formatConsoleLog = (entries: readonly ConsoleEntry[]) =>
  entries.length ? `${entries.map(formatConsoleEntry).join("\n\n")}\n` : "";

export const countBySeverity = (entries: readonly { severity: ConsoleSeverity }[]) => {
  const counts: Record<ConsoleSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const entry of entries) {
    counts[entry.severity] += 1;
  }
  return counts;
};
