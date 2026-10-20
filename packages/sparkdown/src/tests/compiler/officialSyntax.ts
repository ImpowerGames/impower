import { loadOfficialLuau } from "./officialLuau";

// Test-only oracle. Production code never loads the official parser artifact.
export const parseOfficialSyntax = await loadOfficialLuau();

export function officialSyntaxErrors(source: string) {
  return parseOfficialSyntax(source).diagnostics;
}

/**
 * Errors written `line:column-line:column message` (or with a code before
 * the message), in the order of where each begins, those that begin
 * together by their text, so two lists of one set compare equal.
 */
export function inPositionOrder(errors: readonly string[]): string[] {
  const start = (e: string) => e.split("-", 1)[0]!.split(":").map(Number) as [number, number];
  return [...errors].sort((a, b) => {
    const [al, ac] = start(a);
    const [bl, bc] = start(b);
    return al - bl || ac - bc || (a < b ? -1 : a > b ? 1 : 0);
  });
}

/**
 * Every error the official parser reports for a source, as
 * `line:column-line:column message`, in position order (`inPositionOrder`),
 * as Sparkdown reports every one (I-1322). In a `.sd` document (`luauFile`
 * false) an error at the end of the input begins, as Sparkdown places it,
 * where the source's last token ends, since the Luau a unit holds ends
 * there, and ends where the input ends, as the official parser's does; in a
 * `.luau` file, whose whole text is the unit, it is the official parser's.
 */
export function officialErrorList(source: string, { luauFile = false }: { luauFile?: boolean } = {}): string[] {
  const lines = source.split("\n");
  const last = { line: lines.length - 1, column: lines[lines.length - 1]!.length };
  const trimmed = source.trimEnd().split("\n");
  const lastToken = { line: trimmed.length - 1, column: trimmed[trimmed.length - 1]!.length };
  return inPositionOrder(
    officialSyntaxErrors(source).map(({ location: { begin, end }, message }) => {
      const atEof = !luauFile && message.includes("got <eof>") && begin.line === last.line && begin.column === last.column;
      const start = atEof ? lastToken : begin;
      return `${start.line}:${start.column}-${end.line}:${end.column} ${message}`;
    }),
  );
}
