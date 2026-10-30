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
let pinned: Snackbar | null = null;

const clearDismissTimer = () => {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = 0;
  }
};

export function showSnackbar(s: Snackbar) {
  const mine = ++token;
  if (s.persistent) {
    pinned = s;
  }
  snackbar.value = s;
  clearDismissTimer();
  if (s.persistent) {
    return;
  }
  dismissTimer = setTimeout(() => {
    if (token === mine) {
      dismissTimer = 0;
      snackbar.value = pinned;
    }
  }, AUTO_DISMISS_MS) as unknown as number;
}

export function dismissSnackbar(s: Snackbar | null = snackbar.value) {
  if (s && s === pinned) {
    pinned = null;
  }
  if (snackbar.value !== s) {
    return;
  }
  token++;
  clearDismissTimer();
  snackbar.value = pinned;
}
