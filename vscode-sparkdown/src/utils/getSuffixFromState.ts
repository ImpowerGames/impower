import { suffixes } from "../constants/suffixes";

export const getSuffixFromState = (
  state?: "error" | "warning" | "info"
): string => {
  return suffixes[state || ""];
};
