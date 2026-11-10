import SPARKDOWN_LUAU_CONFIG from "../../../language/sparkdown-luau.language-config.json";
import SPARKDOWN_CONFIG from "../../../language/sparkdown.language-config.json";
import { isLuauFile } from "../typecheck/LuauUnitNodes";

export const SPARKDOWN_LANGUAGE = "sparkdown";

export const SPARKDOWN_LUAU_LANGUAGE = "sparkdown-luau";

export const SPARKDOWN_LANGUAGE_CONFIGS = {
  [SPARKDOWN_LANGUAGE]: SPARKDOWN_CONFIG,
  [SPARKDOWN_LUAU_LANGUAGE]: SPARKDOWN_LUAU_CONFIG,
};

export const SPARKDOWN_EMBEDDED_LANGUAGES: Readonly<Record<string, string>> = {
  "meta.embedded.block.luau": SPARKDOWN_LUAU_LANGUAGE,
  "meta.embedded.line.luau": SPARKDOWN_LUAU_LANGUAGE,
};

export function sparkdownLanguageFor(uri: string | undefined): string {
  return uri !== undefined && isLuauFile(uri)
    ? SPARKDOWN_LUAU_LANGUAGE
    : SPARKDOWN_LANGUAGE;
}
