import { SparkParseResult } from "../../../sparkdown/src";

export const generateSparkCsvData = (result: SparkParseResult): string[][] => {
  const language: string =
    result?.titleTokens?.["language"]?.[0]?.content || "en-US [English (US)]";
  const strings: string[][] = [["KEY", "CONTEXT", language]];
  Object.keys(result.properties?.characters || {})
    ?.sort()
    ?.forEach((character) => {
      strings.push([character, "N:", character]);
    });
  Object.entries(result.sections || {})?.forEach(([sectionId, section]) => {
    const characterKeys: Record<string, number> = {};
    const typeKeys: Record<string, number> = {};
    let dialogueIndex = 0;
    (section.tokens || []).forEach((t) => {
      if (typeKeys[t.type] === undefined) {
        typeKeys[t.type] = 0;
      } else {
        typeKeys[t.type] += 1;
      }
      if (t.type === "dialogue_character") {
        if (characterKeys[t.content] === undefined) {
          characterKeys[t.content] = 0;
        } else {
          characterKeys[t.content] += 1;
        }
        dialogueIndex = -1;
      }
      if (t.ignore) {
        return;
      }
      const keyPrefix = `${sectionId}.${t.type}.`;
      if (t.type === "dialogue") {
        dialogueIndex += 1;
        const characterIndex = characterKeys[t.character];
        const characterChunkIndex = String(characterIndex).padStart(3, "0");
        const characterLineIndex = String(dialogueIndex).padStart(3, "0");
        const key = `${keyPrefix}${t.character}_${characterChunkIndex}_${characterLineIndex}`;
        const parenthetical = t.parenthetical ? `${t.parenthetical}\n` : "";
        const content = `${parenthetical}${t.content?.trimEnd()}`;
        strings.push([key, `D: ${t.character}`, content]);
      }
      const typeIndex = typeKeys[t.type];
      const typeChunkIndex = String(typeIndex).padStart(3, "0");
      const key = `${keyPrefix}${typeChunkIndex}`;
      const content = t.content?.trimEnd();
      if (t.type === "action") {
        strings.push([key, "", content]);
      }
      if (t.type === "centered") {
        const content = t.content?.trimEnd();
        strings.push([key, "C:", content]);
      }
      if (t.type === "transition") {
        const content = t.content?.trimEnd();
        strings.push([key, "T:", content]);
      }
      if (t.type === "scene") {
        const content = t.content?.trimEnd();
        strings.push([key, "S:", content]);
      }
    });
  });
  return strings;
};
