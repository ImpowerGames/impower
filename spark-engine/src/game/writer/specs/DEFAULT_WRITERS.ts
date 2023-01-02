import { Writer } from "../types/Writer";

export const DEFAULT_WRITERS: Record<string, Writer> = {
  choice: {
    className: "Choice",
  },
  parenthetical: {
    className: "Parenthetical",
    hidden: "beat",
  },
  indicator: {
    className: "Indicator",
    fadeDuration: 0.15,
  },
};
