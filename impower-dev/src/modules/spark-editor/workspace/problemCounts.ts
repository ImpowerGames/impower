export interface DiagnosticCounts {
  errors: number;
  warnings: number;
  infos: number;
}

export interface ProblemCounts {
  problems: number;
  notes: number;
}

const ERROR = 1;
const WARNING = 2;
const INFORMATION = 3;

export const countDiagnostics = (
  diagnostics: readonly { severity?: number }[],
): DiagnosticCounts => {
  const counts = { errors: 0, warnings: 0, infos: 0 };
  for (const { severity = ERROR } of diagnostics) {
    if (severity === ERROR) {
      counts.errors++;
    } else if (severity === WARNING) {
      counts.warnings++;
    } else if (severity === INFORMATION) {
      counts.infos++;
    }
  }
  return counts;
};

export const countProblems = (
  summary: Readonly<Record<string, DiagnosticCounts>> | undefined,
): ProblemCounts => {
  const counts = { problems: 0, notes: 0 };
  for (const { errors, warnings, infos } of Object.values(summary ?? {})) {
    counts.problems += errors + warnings;
    counts.notes += infos;
  }
  return counts;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export const problemsLabel = ({ problems, notes }: ProblemCounts): string => {
  const head = problems ? plural(problems, "problem") : "No problems";
  return notes ? `${head} · ${plural(notes, "note")}` : head;
};
