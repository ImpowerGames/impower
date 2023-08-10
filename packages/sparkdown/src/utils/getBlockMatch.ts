import { SPARK_BLOCK_REGEX } from "../constants/SPARK_REGEX";

const getBlockMatch = (lineText: string): string[] | null => {
  const entries = Object.entries(SPARK_BLOCK_REGEX);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const [k, v] = entry;
    const match = lineText.match(v);
    if (match) {
      match[0] = k;
      return match;
    }
  }
  return null;
};

export default getBlockMatch;
