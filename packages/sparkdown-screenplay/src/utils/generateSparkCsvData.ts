import { SparkProgram } from "../../../sparkdown/src";

export const generateSparkCsvData = (program: SparkProgram): string[][] => {
  const language: string =
    program?.frontMatter?.["language"]?.[0]?.content || "en-US [English (US)]";
  const strings: string[][] = [["KEY", "CONTEXT", language]];
  Object.keys(program?.metadata?.characters || {})
    ?.sort()
    ?.forEach((character) => {
      strings.push([character, "N:", character]);
    });
  Object.entries(program.sections || {})?.forEach(([sectionId, section]) => {
    const characterKeys: Record<string, number> = {};
    const typeKeys: Record<string, number> = {};
    let dialogueIndex = 0;
    (section.tokens || []).forEach((t) => {
      if (typeKeys[t.tag] === undefined) {
        typeKeys[t.tag] = 0;
      } else {
        typeKeys[t.tag] += 1;
      }
      if (t.tag === "dialogue_character") {
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
      const keyPrefix = `${sectionId}.${t.tag}.`;
      if (t.tag === "dialogue") {
        dialogueIndex += 1;
        const characterIndex = characterKeys[t.character];
        const characterChunkIndex = String(characterIndex).padStart(3, "0");
        const characterLineIndex = String(dialogueIndex).padStart(3, "0");
        const key = `${keyPrefix}${t.character}_${characterChunkIndex}_${characterLineIndex}`;
        const parenthetical = t.parenthetical ? `${t.parenthetical}\n` : "";
        const content = `${parenthetical}${t.content?.trimEnd()}`;
        strings.push([key, `D: ${t.character}`, content]);
      }
      const typeIndex = typeKeys[t.tag];
      const typeChunkIndex = String(typeIndex).padStart(3, "0");
      const key = `${keyPrefix}${typeChunkIndex}`;
      const content = t.content?.trimEnd();
      if (t.tag === "action") {
        strings.push([key, "", content]);
      }
      if (t.tag === "centered") {
        const content = t.content?.trimEnd();
        strings.push([key, "C:", content]);
      }
      if (t.tag === "transition") {
        const content = t.content?.trimEnd();
        strings.push([key, "T:", content]);
      }
      if (t.tag === "scene") {
        const content = t.content?.trimEnd();
        strings.push([key, "S:", content]);
      }
    });
  });
  return strings;
};
