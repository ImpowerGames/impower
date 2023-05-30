import { choose } from "../utils/formatters/choose";
import { pluralize } from "../utils/formatters/pluralize";
import { regex } from "../utils/formatters/regex";

export type CustomFormatter = (
  value: any,
  locale: string,
  ...args: string[]
) => [
  string,
  {
    from: number;
    to: number;
    content: string;
    severity?: "info" | "warning" | "error";
    message?: string;
  }[],
  number[]
];

export const CUSTOM_FORMATTERS: Record<string, CustomFormatter> = {
  regex,
  r: regex,
  choose,
  c: choose,
  pluralize,
  p: pluralize,
};
