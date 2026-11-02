import type { SparkProgram } from "../types/SparkProgram";
import { playRefusalOf } from "./startScene";

export const programSummary = (
  program: SparkProgram,
  runnable: boolean,
): SparkProgram => ({
  uri: program.uri,
  scripts: program.scripts,
  files: {},
  version: program.version,
  filesEpoch: program.filesEpoch,
  workspace: program.workspace,
  startFrom: program.startFrom,
  summary: true,
  runnable,
  playRefusal: playRefusalOf(program),
});

export const isSameProgram = (
  a: Pick<SparkProgram, "uri" | "scripts" | "filesEpoch"> | undefined | null,
  b: Pick<SparkProgram, "uri" | "scripts" | "filesEpoch"> | undefined | null,
): boolean => {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.uri !== b.uri || a.filesEpoch !== b.filesEpoch) {
    return false;
  }
  const scripts = Object.entries(a.scripts ?? {});
  return (
    scripts.length === Object.keys(b.scripts ?? {}).length &&
    scripts.every(([uri, version]) => b.scripts?.[uri] === version)
  );
};

export const isRunnableProgram = (
  program: SparkProgram | undefined | null,
): boolean =>
  program?.summary ? program.runnable === true : !!program?.chunks;
