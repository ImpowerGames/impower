import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge Tailwind class lists with intelligent conflict resolution. Later
// classes win for any utility group (bg-*, p-*, etc.). Use this in any
// component that accepts a `class` prop from consumers, so their classes
// override the component's defaults predictably.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
