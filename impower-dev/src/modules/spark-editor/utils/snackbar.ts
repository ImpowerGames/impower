import { signal } from "@preact/signals";

export interface Snackbar {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissLabel?: string;
}

export const snackbar = signal<Snackbar | null>(null);

const AUTO_DISMISS_MS = 6000;
let dismissTimer = 0;
let token = 0;

const clearDismissTimer = () => {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = 0;
  }
};

export function showSnackbar(s: Snackbar) {
  const mine = ++token;
  snackbar.value = s;
  clearDismissTimer();
  dismissTimer = setTimeout(() => {
    if (token === mine) {
      dismissTimer = 0;
      snackbar.value = null;
    }
  }, AUTO_DISMISS_MS) as unknown as number;
}

export function dismissSnackbar(s: Snackbar | null = snackbar.value) {
  if (snackbar.value !== s) {
    return;
  }
  token++;
  clearDismissTimer();
  snackbar.value = null;
}
