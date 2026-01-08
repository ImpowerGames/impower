import { Matcher } from "../classes/helpers/Matcher";
import { Prosody } from "../types/Prosody";

export const getStressMatch = (
  phrase: string,
  prosody: Prosody | undefined
): [string, string] => {
  if (prosody) {
    const entries = Object.entries(prosody);
    for (let i = 0; i < entries.length; i += 1) {
      const [k, v] = entries[i]!;
      if (!k.startsWith("$") && typeof v === "string") {
        const matcher = new Matcher(v);
        const match = matcher.match(phrase.trim().toLowerCase());
        if (match) {
          return [k, match[1]!];
        }
      }
    }
  }
  return ["statement", "."];
};
