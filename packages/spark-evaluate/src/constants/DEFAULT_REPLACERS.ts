import { Replacer } from "../types/Replacer";
import { choose } from "../utils/formatters/choose";
import { pluralize } from "../utils/formatters/pluralize";
import { regex } from "../utils/formatters/regex";

export const DEFAULT_REPLACERS: Record<string, Replacer> = {
  regex,
  r: regex,
  choose,
  c: choose,
  pluralize,
  p: pluralize,
};
