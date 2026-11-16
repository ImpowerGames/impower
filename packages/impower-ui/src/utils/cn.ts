import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge, validators } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      borderRadius: ["control", "card", "dialog", "toast"],
    },
    classGroups: {
      shadow: [{ shadow: ["float"] }],
      pr: [{ "pr-gutter": [validators.isNumber, validators.isArbitraryLength] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
