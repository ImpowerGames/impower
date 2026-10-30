export interface IdentifiableProgram {
  uri?: string;
  scripts?: Record<string, number>;
  filesEpoch?: number;
}

export const programIdentity = (
  program: IdentifiableProgram | undefined | null,
): string | undefined => {
  if (!program?.uri) {
    return undefined;
  }
  const scripts = Object.entries(program.scripts ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([uri, version]) => `${uri}@${version}`)
    .join(" ");
  return `${program.uri} ${scripts} files@${program.filesEpoch ?? -1}`;
};
