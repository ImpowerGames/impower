import { Diagnostic } from "./Diagnostic";

export type Formatter = (
  str: string,
  context?: Record<string, unknown>
) => [string, Diagnostic[], Diagnostic[]];
