import { CompilerDiagnostic } from "./CompilerDiagnostic";

export type CustomFormatter = (
  value: any,
  locale: string,
  ...args: string[]
) => [string, CompilerDiagnostic[], number[]];
