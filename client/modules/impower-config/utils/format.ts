import regexes from "../../../resources/json/en/regexes.json";
import ConfigCache from "../classes/configCache";
import { abbreviateAge } from "./formatters/abbreviateAge";
import { abbreviateCount } from "./formatters/abbreviateCount";
import { choose } from "./formatters/choose";
import { pluralize } from "./formatters/pluralize";

export type Formatter = (
  value: unknown,
  locale: string,
  ...args: string[]
) => string;

export type Formatters = { [formatter: string]: Formatter };

const regex = (value: string, _locale: string, arg: string): string => {
  const configRegexes = ConfigCache.instance.params?.regexes || regexes;
  const varRegexes: { [regex: string]: string } = configRegexes?.[arg] || {};
  const varRegexEntries = Object.entries(varRegexes);
  for (let i = 0; i < varRegexEntries.length; i += 1) {
    const [regex, replacement] = varRegexEntries[i];
    if (new RegExp(regex).test(value)) {
      return replacement;
    }
  }
  return varRegexes[""];
};

const abbreviate = (
  value: Date | number,
  locale: string,
  arg: string
): string => {
  if (typeof value === "number") {
    return abbreviateCount(value, locale, arg ? Number(arg) : 1);
  }
  return abbreviateAge(value, locale);
};

const customFormatters: Formatters = {
  regex,
  r: regex,
  abbreviate,
  a: abbreviate,
  choose,
  c: choose,
  pluralize,
  p: pluralize,
};

const format = (
  str: string,
  args: Record<string, unknown>,
  locale?: string,
  formatters: Formatters = customFormatters
): string => {
  if (!str) {
    return str;
  }
  const replacer = (match: string): string => {
    const [tagKey, formatterKey, param] = match.slice(1, -1).split(":");
    if (!tagKey) {
      return match;
    }
    const val = args[tagKey];
    if (!formatterKey) {
      return String(val);
    }
    const formatter = formatters[formatterKey];
    if (formatter && param) {
      const params = param.split("|");
      return formatter(val, locale, ...params);
    }
    if (!formatter && !param && typeof val === "number") {
      const params = formatterKey.split("|");
      return pluralize(val, locale, ...params);
    }
    return String(val);
  };
  return str.replace(/\{.+?\}/g, replacer);
};

export default format;
