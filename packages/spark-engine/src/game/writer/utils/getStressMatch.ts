import { Prosody } from "../specs/Prosody";

export const getStressMatch = (
  phrase: string,
  prosody: Prosody | undefined
): [string, string] => {
  if (prosody) {
    const entries = Object.entries(prosody);
    for (let i = 0; i < entries.length; i += 1) {
      const [k, v] = entries[i]!;
      const match = phrase
        .trim()
        .toLowerCase()
        .match(new RegExp(v as string, "u"));
      if (match) {
        return [k, match[1]!];
      }
    }
  }
  return ["statement", "."];
};
