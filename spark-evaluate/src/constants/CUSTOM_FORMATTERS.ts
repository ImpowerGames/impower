import { CustomFormatter } from "../types/CustomFormatter";
import { choose } from "../utils/formatters/choose";
import { pluralize } from "../utils/formatters/pluralize";
import { regex } from "../utils/formatters/regex";

export const CUSTOM_FORMATTERS: Record<string, CustomFormatter> = {
  regex,
  r: regex,
  choose,
  c: choose,
  pluralize,
  p: pluralize,
};
