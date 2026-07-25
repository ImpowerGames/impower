import { signal } from "@preact/signals";

export interface Snackbar {
  message: string;
  /** Optional action button label (e.g. "Undo"). */
  actionLabel?: string;
  /** Run when the action button is pressed (the snackbar then dismisses). */
  onAction?: () => void;
}

/** The currently-shown transient snackbar, or null. Read by SnackbarHost. */
export const snackbar = signal<Snackbar | null>(null);

const AUTO_DISMISS_MS = 6000;
let dismissTimer = 0;
// Guards the auto-dismiss against a newer snackbar replacing this one.
let token = 0;

export function showSnackbar(s: Snackbar) {
  const mine = ++token;
  snackbar.value = s;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
  }
  dismissTimer = setTimeout(() => {
    if (token === mine) {
      snackbar.value = null;
    }
  }, AUTO_DISMISS_MS) as unknown as number;
}

export function dismissSnackbar() {
  token++;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = 0;
  }
  snackbar.value = null;
}
