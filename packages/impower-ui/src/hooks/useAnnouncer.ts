import { signal } from "@preact/signals";

export const announcement = signal("");

export const announce = (message: string): void => {
  const text = message.trim();
  if (!text) {
    return;
  }
  announcement.value =
    announcement.peek() === text ? `${text} ` : text;
};

export function useAnnouncer(): (message: string) => void {
  return announce;
}
