import { useState } from "preact/hooks";
import {
  CONSOLE_SEVERITIES,
  consoleLocation,
  countBySeverity,
  formatConsoleLog,
  formatConsoleTime,
  type ConsoleEntry,
  type ConsoleJump,
  type ConsoleSeverity,
} from "./consoleEntries";

export const CLIPBOARD_UNAVAILABLE =
  "Clipboard unavailable. Use Save to keep these messages.";

export const CONSOLE_SAVE_FILENAME = "play-log.txt";

const SEVERITY_LABELS: Record<ConsoleSeverity, string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Info",
};

export interface PlayerConsoleProps {
  entries: readonly ConsoleEntry[];
  onJump?: (jump: ConsoleJump) => void;
  onClear?: () => void;
}

const saveText = (text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = CONSOLE_SAVE_FILENAME;
  link.click();
  URL.revokeObjectURL(url);
};

export default function PlayerConsole({
  entries,
  onJump,
  onClear,
}: PlayerConsoleProps) {
  const [shown, setShown] = useState<Record<ConsoleSeverity, boolean>>({
    error: true,
    warning: true,
    info: true,
  });
  const [note, setNote] = useState("");
  const counts = countBySeverity(entries);
  const visible = entries.filter((entry) => shown[entry.severity]);

  const copy = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error(CLIPBOARD_UNAVAILABLE);
      }
      await navigator.clipboard.writeText(formatConsoleLog(visible));
      setNote("Copied");
    } catch {
      setNote(CLIPBOARD_UNAVAILABLE);
    }
  };

  return (
    <section class="swp-console" aria-label="Play log">
      <div class="swp-console-toolbar">
        <div class="swp-console-filters" role="group" aria-label="Severity">
          {CONSOLE_SEVERITIES.map((severity) => (
            <button
              key={severity}
              type="button"
              class="swp-console-button swp-console-filter"
              data-severity={severity}
              aria-pressed={shown[severity]}
              onClick={() =>
                setShown((current) => ({
                  ...current,
                  [severity]: !current[severity],
                }))
              }
            >
              <span class="swp-severity-glyph" data-severity={severity} />
              {SEVERITY_LABELS[severity]}
              <span class="swp-console-count">{counts[severity]}</span>
            </button>
          ))}
        </div>
        <div class="swp-console-actions">
          <button
            type="button"
            class="swp-console-button"
            onClick={() => {
              setNote("");
              onClear?.();
            }}
          >
            Clear
          </button>
          <button type="button" class="swp-console-button" onClick={copy}>
            Copy
          </button>
          <button
            type="button"
            class="swp-console-button"
            onClick={() => saveText(formatConsoleLog(visible))}
          >
            Save
          </button>
        </div>
      </div>
      <span class="swp-console-note" role="status">
        {note}
      </span>
      {visible.length ? (
        <ol class="swp-console-entries">
          {visible.map((entry, index) => (
            <li key={index} class="swp-console-entry" data-severity={entry.severity}>
              <span class="swp-severity-glyph" data-severity={entry.severity} />
              {entry.time != null ? (
                <span class="swp-console-time">
                  {formatConsoleTime(entry.time)}
                </span>
              ) : null}
              <span class="swp-console-message">
                {entry.title ? (
                  <span class="swp-console-title">{entry.title}</span>
                ) : null}
                {entry.message}
              </span>
              {entry.path ? (
                <button
                  type="button"
                  class="swp-console-jump"
                  onClick={() =>
                    onJump?.({ path: entry.path!, line: entry.line ?? 1 })
                  }
                >
                  {consoleLocation(entry)}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p class="swp-console-empty">No messages</p>
      )}
    </section>
  );
}
