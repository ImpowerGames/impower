import { CompilerDiagnostic } from "./compilerDiagnostic";

export type CustomFormatter = (
  value: any,
  locale: string,
  ...args: string[]
) => [string, CompilerDiagnostic[], number[]];
