import { writeSparkleSelector } from "../../../sparkle-style-transformer/src/utils/sparkleSelector";

export function sparkleSelectorToCssSelector(
  selector: string,
  breakpoints: Record<string, number>,
): string {
  return writeSparkleSelector(selector, { breakpoints, colorScheme: "media" });
}
