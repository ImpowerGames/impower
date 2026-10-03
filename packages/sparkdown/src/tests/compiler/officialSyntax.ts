import { loadOfficialLuau } from "./officialLuau";

// Test-only oracle. Production code never loads the official parser artifact.
export const parseOfficialSyntax = await loadOfficialLuau();

export function officialSyntaxErrors(source: string) {
  return parseOfficialSyntax(source).diagnostics;
}
