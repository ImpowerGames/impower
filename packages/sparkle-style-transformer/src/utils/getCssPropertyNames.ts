import { CSS_ALIASES } from "../constants/CSS_ALIASES.js";
import { CSS_UTILITIES } from "../constants/CSS_UTILITIES.js";
import { STYLE_ALIASES } from "../constants/STYLE_ALIASES.js";

/**
 * Every CSS declaration name a sparkle prop can expand to, independent of its
 * VALUE.
 *
 * This is what removal needs. `getCssEquivalent` answers "what does this prop
 * SET", which requires a value and runs it through a transformer — and a prop
 * being cleared has no value, so the transformer returns nothing and the
 * expansion comes back empty. There is then no declaration name to remove and
 * the old value stays painted: `#background-color` set to `red` and then
 * cleared left `background-color: var(--theme-color-red)` on the element, with
 * the reactive runtime correctly believing it had removed it.
 *
 * The union across ALL of a utility's selectors, not just the default one: a
 * value-specific selector can introduce declarations the default never names
 * (`#display=none` vs `#display=grid`), and leaving one behind is the same bug
 * in a narrower place.
 */
export const getCssPropertyNames = (key: string): string[] => {
  const aliases: Record<string, string> = {
    ...STYLE_ALIASES,
    ...CSS_ALIASES,
  };
  const cssUtilities: Record<
    string,
    Record<string, Record<string, string>>
  > = CSS_UTILITIES;

  const cssUtility = cssUtilities[aliases[key] ?? key];
  if (!cssUtility) {
    // Unrecognized props pass straight through as raw CSS, matching
    // `getCssEquivalent`'s own fallback — which uses the ORIGINAL key, not the
    // aliased one.
    return [key];
  }
  const names = new Set<string>();
  for (const selector of Object.values(cssUtility)) {
    for (const cssProp of Object.keys(selector)) {
      names.add(cssProp);
    }
  }
  return [...names];
};
