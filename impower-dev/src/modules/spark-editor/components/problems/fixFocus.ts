import type { Problem } from "../../workspace/problems/problemEntries";

export const FIX_FOCUS_WAIT_MS = 10_000;

const ENTRY = "[data-problem-entry]";

export const problemSignature = (problem: Problem) =>
  [problem.uri, problem.severity, problem.title, problem.message].join("\n");

const entriesIn = (root: Element) => Array.from(root.querySelectorAll(ENTRY));

const signatureOf = (entry: Element) => entry.getAttribute("data-problem-entry");

const focusTargetIn = (entry: Element | undefined) =>
  entry?.querySelector<HTMLElement>("[data-fix-menu]") ??
  entry?.querySelector<HTMLElement>("button, a[href]") ??
  null;

const focusLost = (root: Element) => {
  const active = document.activeElement;
  return (
    !active ||
    active === document.body ||
    active === root ||
    (active.getAttribute("role") === "dialog" && active.contains(root))
  );
};

export function keepFocusAfterFix(
  root: HTMLElement,
  chosen: Problem,
  fallback: () => HTMLElement | null,
) {
  const entries = entriesIn(root);
  const at = entries.findIndex(
    (entry) => entry.getAttribute("data-problem-key") === chosen.key,
  );
  if (at < 0) {
    return () => {};
  }
  const signature = signatureOf(entries[at]!);
  const count = (list: Element[]) =>
    list.filter((entry) => signatureOf(entry) === signature).length;
  const before = count(entries);
  const settle = () => {
    const now = entriesIn(root);
    if (count(now) >= before) {
      return false;
    }
    if (focusLost(root)) {
      (focusTargetIn(now[at]) ?? focusTargetIn(now[at - 1]) ?? fallback())?.focus();
    }
    return true;
  };
  const observer = new MutationObserver(() => {
    if (settle()) {
      stop();
    }
  });
  const timer = setTimeout(() => stop(), FIX_FOCUS_WAIT_MS);
  const stop = () => {
    clearTimeout(timer);
    observer.disconnect();
  };
  observer.observe(root, { childList: true, subtree: true });
  return stop;
}
