import { suffixes } from "../constants/SUFFIXES";

export const getStateFromSuffix = (
  suffix?: string
): "error" | "warning" | "info" | "" => {
  const keys = Object.keys(suffixes) as ("error" | "warning" | "info")[];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key) {
      const value = suffixes[key];
      if (suffix?.endsWith(value)) {
        return key;
      }
    }
  }
  return "";
};
