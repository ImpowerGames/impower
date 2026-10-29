export const compiledElsewhere = (
  program: { scripts?: Record<string, number> },
  point: { file: string } | null | undefined,
): boolean =>
  point != null && program.scripts != null && !(point.file in program.scripts);
