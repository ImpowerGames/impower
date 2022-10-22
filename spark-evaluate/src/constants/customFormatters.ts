import { CustomFormatter } from "../types/customFormatter";
import { choose } from "../utils/formatters/choose";
import { pluralize } from "../utils/formatters/pluralize";
import { regex } from "../utils/formatters/regex";

export const customFormatters: Record<string, CustomFormatter> = {
  regex,
  r: regex,
  choose,
  c: choose,
  pluralize,
  p: pluralize,
};
