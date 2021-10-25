import ConfigCache from "../../classes/configCache";
import format from "../format";

export const abbreviateCount = (
  value: number,
  locale?: string,
  decPlaces = 1
): string => {
  const abbreviations = ConfigCache.instance.params?.abbreviations?.count;

  // 2 decimal places => 100, 3 => 1000, etc
  decPlaces = 10 ** decPlaces;

  // Enumerate number abbreviations
  const abbrev = ["k", "m", "b", "t"].map(
    (a) => abbreviations?.[a] || `{count}${a}`
  );
  let message = "";

  // Go through the array backwards, so we do the largest first
  for (let i = abbrev.length - 1; i >= 0; i -= 1) {
    // Convert array index to "1000", "1000000", etc
    const size = 10 ** ((i + 1) * 3);

    // If the number is bigger or equal do the abbreviation
    if (size <= value) {
      // Here, we multiply by decPlaces, round, and then divide by decPlaces.
      // This gives us nice rounding to a particular decimal place.
      value = Math.round((value * decPlaces) / size) / decPlaces;

      // Handle special case where we round up to the next abbreviation
      if (value === 1000 && i < abbrev.length - 1) {
        value = 1;
        i += 1;
      }
      message = abbrev[i];
      // We are done... stop
      break;
    }
  }

  if (message) {
    return format(message, { count: value }, locale);
  }
  return `${value}`;
};
