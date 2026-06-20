import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

// Asset media types that scripts reference by bare name (`[[show image X]]` →
// `image.X`). Scripts/text are handled by the include-path mechanism, not this.
const REFERENCEABLE_ASSET_TYPES = new Set(["image", "audio", "video", "font"]);

/**
 * The synthetic "symbol seed" for a FILE, so the reference matcher
 * ({@link import("./getReferences").collectReferencesForTarget}) can be driven
 * by a file's `(name, type)` instead of a cursor position. Assets resolve to
 * `<type>.<name>`; returns `null` for anything not referenced by bare name
 * (scripts, plain text), which the callers treat as "no references — just move".
 *
 * NOTE: `.url` (remote) assets resolve their medium from the URL body, but
 * `getFileType` here is extension-glob-based and returns `url`, so a `.url`
 * asset currently yields `null` (plain move, no reference rewrite). Local
 * imported assets are the common case and work; `.url` reference-rename is a
 * follow-up.
 */
export const getFileSymbol = (
  workspace: SparkdownLanguageServerWorkspace,
  uri: string,
): { name: string; type: string; symbolIds: string[] } | null => {
  const name = workspace.getFileName(uri);
  if (!name) {
    return null;
  }
  const type = workspace.getFileType(uri);
  if (REFERENCEABLE_ASSET_TYPES.has(type)) {
    return { name, type, symbolIds: [`${type}.${name}`] };
  }
  return null;
};
