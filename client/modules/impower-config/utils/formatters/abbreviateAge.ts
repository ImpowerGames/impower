import ConfigCache from "../../classes/configCache";
import format from "../format";

export const abbreviateAge = (value: Date, locale?: string): string => {
  const abbreviations = ConfigCache.instance.params?.abbreviations?.age;

  const minute = 60 * 1000; /* ms */
  const hour = 60 * minute; /* ms */
  const day = 24 * hour; /* ms */
  const month = 30 * day; /* ms */
  const year = 365 * day; /* ms */
  if (!value || Number.isNaN(value.getTime())) {
    return undefined;
  }
  const difference = Date.now() - value.getTime();
  if (difference < minute) {
    return "Now";
  }
  if (difference < hour) {
    const message = abbreviations?.m || "{age}m";
    return format(message, { age: Math.round(difference / minute) }, locale);
  }
  if (difference < day) {
    const message = abbreviations?.h || "{age}h";
    return format(message, { age: Math.round(difference / hour) }, locale);
  }
  if (difference < month) {
    const message = abbreviations?.d || "{age}d";
    return format(message, { age: Math.round(difference / day) }, locale);
  }
  if (difference < year) {
    const message = abbreviations?.mo || "{age}mo";
    return format(message, { age: Math.round(difference / month) }, locale);
  }
  const message = abbreviations?.y || "{age}y";
  return format(message, { age: Math.round(difference / year) }, locale);
};
