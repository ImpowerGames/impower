import {
  type WrittenSparkleSelector,
  writeSparkleSelectorChecked,
} from "../../../sparkle-style-transformer/src/utils/sparkleSelector";

export function sparkleSelectorToCssSelector(
  selector: string,
  breakpoints: Record<string, number>,
  afterCombinator = false,
): WrittenSparkleSelector | undefined {
  const written = writeSparkleSelectorChecked(selector, { breakpoints, colorScheme: "media", afterCombinator });
  return written.refusals.length > 0 ? undefined : written;
}
