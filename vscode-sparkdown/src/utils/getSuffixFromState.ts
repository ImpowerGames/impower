import { suffixes } from "../constants/SUFFIXES";

export const getSuffixFromState = (
  state?: "error" | "warning" | "info"
): string => {
  return suffixes[state || ""];
};
