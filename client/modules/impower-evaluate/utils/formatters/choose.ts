import { CompilerDiagnostic } from "../..";

export const choose = (
  value: number,
  locale?: string,
  ...args: string[]
): [string, CompilerDiagnostic[]] => {
  const diagnostics: CompilerDiagnostic[] = [];
  const result = args[value];
  if (value >= args.length) {
    const params = args.join("|");
    diagnostics.push({
      content: params,
      from: 0,
      to: params.length,
      severity: "error",
      type: "invalid-formatter-arguments",
      message: `Attempted to select option at index '${value}' but only '${args.length}' options specified`,
    });
  }
  return [result, diagnostics];
};
