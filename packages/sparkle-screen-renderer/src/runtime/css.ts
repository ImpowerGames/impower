import { writeSparkleSelectorChecked } from "../../../sparkle-style-transformer/src/utils/sparkleSelector";

export function sparkleSelectorToCssSelector(
  selector: string,
  breakpoints: Record<string, number>,
): string | undefined {
  const { css, refusals } = writeSparkleSelectorChecked(selector, { breakpoints, colorScheme: "media" });
  return refusals.length > 0 ? undefined : css;
}
