import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { DocumentHighlight, Location } from "vscode-languageserver";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getFileSymbol } from "./getFileSymbol";
import { collectReferencesForTarget } from "./getReferences";

/**
 * Every script location that references the asset at `uri` (find-usages /
 * "where-used"). Reuses the same matcher as rename, so the count shown always
 * matches what a rename would rewrite. Returns `null` when the file isn't a
 * bare-name-referenced asset (no usages to find). The asset file itself is NOT
 * included (addAssetFiles:false) — only the referencing scripts.
 */
export const getFileReferences = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  uri: string,
): { references: (Location & DocumentHighlight)[] } | null => {
  const seed = getFileSymbol(workspace, uri);
  if (!seed) {
    return null;
  }
  const { references } = collectReferencesForTarget(
    program,
    workspace,
    { symbolName: seed.name, symbolIds: seed.symbolIds },
    {
      searchOtherFiles: true,
      includeDeclaration: true,
      includeInterdependent: false,
      includeLinks: true,
      addAssetFiles: false,
    },
  );
  return { references };
};
