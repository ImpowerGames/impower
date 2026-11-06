import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PlayerConsole, {
  CLIPBOARD_UNAVAILABLE,
  CONSOLE_SAVE_FILENAME,
  type PlayerConsoleProps,
} from "./PlayerConsole";
import { formatConsoleStamp, type ConsoleEntry } from "./consoleEntries";

const TIME = new Date(2026, 10, 5, 9, 4, 7).getTime();

const entries: ConsoleEntry[] = [
  { severity: "error", title: "Runtime error", message: "x is nil", path: "main.sd", line: 42, time: TIME },
  { severity: "warning", message: "Unused variable", path: "scenes/intro.sd", line: 3, time: TIME },
  { severity: "info", message: "Story started", time: TIME },
];

const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mount = (props: Partial<PlayerConsoleProps> = {}) => {
  act(() => {
    render(h(PlayerConsole, { entries, ...props }), container);
  });
  const filter = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>(".swp-console-filter")].find(
      (button) => button.textContent?.startsWith(label),
    )!;
  const action = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>(".swp-console-actions button")].find(
      (button) => button.textContent === label,
    )!;
  const rows = () =>
    [...container.querySelectorAll<HTMLElement>(".swp-console-entry")].map(
      (row) => row.getAttribute("data-severity"),
    );
  return { filter, action, rows };
};

it("counts entries by severity and filters them with toggles", () => {
  const { filter, rows } = mount();
  expect(filter("Errors").textContent).toBe("Errors1");
  expect(filter("Warnings").getAttribute("aria-pressed")).toBe("true");
  expect(rows()).toEqual(["error", "warning", "info"]);
  act(() => filter("Warnings").click());
  expect(filter("Warnings").getAttribute("aria-pressed")).toBe("false");
  expect(rows()).toEqual(["error", "info"]);
  act(() => {
    filter("Errors").click();
    filter("Info").click();
  });
  expect(rows()).toEqual([]);
  expect(container.querySelector(".swp-console-empty")!.textContent).toBe("No messages");
});

it("emits a jump with the entry's path and line, and Clear", () => {
  const onJump = vi.fn();
  const onClear = vi.fn();
  const { action } = mount({ onJump, onClear });
  const jumps = container.querySelectorAll<HTMLButtonElement>(".swp-console-jump");
  expect([...jumps].map((jump) => jump.textContent)).toEqual(["main.sd:42", "scenes/intro.sd:3"]);
  jumps[1]!.click();
  expect(onJump).toHaveBeenCalledWith({ path: "scenes/intro.sd", line: 3 });
  action("Clear").click();
  expect(onClear).toHaveBeenCalledTimes(1);
});

it("copies the shown entries as text, and says so when the clipboard is unavailable", async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  const { filter, action } = mount();
  act(() => filter("Info").click());
  await act(async () => {
    action("Copy").click();
  });
  const time = formatConsoleStamp(TIME);
  expect(writeText).toHaveBeenCalledWith(
    `[${time}] ERROR · Runtime error\nx is nil\nmain.sd:42\n\n` +
      `[${time}] WARNING · Unused variable\nscenes/intro.sd:3\n`,
  );
  expect(container.querySelector(".swp-console-note")!.textContent).toBe("Copied");

  vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
  await act(async () => {
    action("Copy").click();
  });
  expect(container.querySelector(".swp-console-note")!.textContent).toBe(CLIPBOARD_UNAVAILABLE);
});

it("saves the shown entries as a text file", async () => {
  const blobs: Blob[] = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => {
      blobs.push(blob);
      return "blob:play-log";
    },
    revokeObjectURL: vi.fn(),
  });
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  const { action } = mount();
  action("Save").click();
  expect(clicked).toHaveLength(1);
  expect(clicked[0]!.download).toBe(CONSOLE_SAVE_FILENAME);
  expect(clicked[0]!.getAttribute("href")).toBe("blob:play-log");
  expect(blobs[0]!.type).toBe("text/plain");
  expect(await readText(blobs[0]!)).toBe(
    [
      `[${formatConsoleStamp(TIME)}] ERROR · Runtime error\nx is nil\nmain.sd:42`,
      `[${formatConsoleStamp(TIME)}] WARNING · Unused variable\nscenes/intro.sd:3`,
      `[${formatConsoleStamp(TIME)}] INFO · Story started\n`,
    ].join("\n\n"),
  );
});
