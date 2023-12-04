import { Diagnostic } from "./Diagnostic";

export type Replacer = (
  value: any,
  locale: string,
  ...args: string[]
) => [string, Diagnostic[], number[]];
