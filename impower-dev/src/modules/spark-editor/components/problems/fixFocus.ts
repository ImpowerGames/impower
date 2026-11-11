import type { Problem } from "../../workspace/problems/problemEntries";

export const FIX_FOCUS_WAIT_MS = 10_000;

const ENTRY = "[data-problem-entry]";

export const problemSignature = (problem: Problem) =>
  [problem.uri, problem.severity, problem.title, problem.message].join("\n");

const signatureOf = (entry: Element) => entry.getAttribute("data-problem-entry");

const focusTargetIn = (entry: Element) =>
  entry.querySelector<HTMLElement>("[data-fix-menu]") ??
  entry.querySelector<HTMLElement>("button, a[href]");

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
  chosen: string,
  fallback: () => HTMLElement | null,
) {
  const order = Array.from(root.querySelectorAll(ENTRY)).map(signatureOf);
  const at = order.indexOf(chosen);
  const after = order.slice(at + 1);
  const before = order.slice(0, Math.max(0, at)).reverse();
  const present = (signature: string | null) =>
    Array.from(root.querySelectorAll(ENTRY)).find(
      (entry) => signatureOf(entry) === signature,
    );
  const settle = () => {
    if (present(chosen)) {
      return false;
    }
    if (focusLost(root)) {
      const neighbour = [...after, ...before]
        .map(present)
        .find((entry) => entry && focusTargetIn(entry));
      (neighbour ? focusTargetIn(neighbour) : fallback())?.focus();
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
