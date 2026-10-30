import { signal } from "@preact/signals";

export interface Snackbar {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  persistent?: boolean;
}

export const snackbar = signal<Snackbar | null>(null);

const AUTO_DISMISS_MS = 6000;
let dismissTimer = 0;
let token = 0;

export function showSnackbar(s: Snackbar) {
  const mine = ++token;
  snackbar.value = s;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = 0;
  }
  if (s.persistent) {
    return;
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
