import { loadOfficialLuau } from "./officialLuau";

export const parseOfficialSyntax = await loadOfficialLuau();

export function officialSyntaxErrors(source: string) {
  return parseOfficialSyntax(source).diagnostics;
}

export function inPositionOrder(errors: readonly string[]): string[] {
  const start = (e: string) => e.split("-", 1)[0]!.split(":").map(Number) as [number, number];
  return [...errors].sort((a, b) => {
    const [al, ac] = start(a);
    const [bl, bc] = start(b);
    return al - bl || ac - bc || (a < b ? -1 : a > b ? 1 : 0);
  });
}

export function officialErrorsInReportOrder(source: string, { luauFile = false }: { luauFile?: boolean } = {}): string[] {
  const lines = source.split("\n");
  const last = { line: lines.length - 1, column: lines[lines.length - 1]!.length };
  const trimmed = source.trimEnd().split("\n");
  const lastToken = { line: trimmed.length - 1, column: trimmed[trimmed.length - 1]!.length };
  return officialSyntaxErrors(source).map(({ location: { begin, end }, message }) => {
    const atEof = !luauFile && message.includes("got <eof>") && begin.line === last.line && begin.column === last.column;
    const start = atEof ? lastToken : begin;
    return `${start.line}:${start.column}-${end.line}:${end.column} ${message}`;
  });
}

export function officialErrorList(source: string, options: { luauFile?: boolean } = {}): string[] {
  return inPositionOrder(officialErrorsInReportOrder(source, options));
}
