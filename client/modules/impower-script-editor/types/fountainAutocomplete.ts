/* eslint-disable no-template-curly-in-string */
import {
  completeFromList,
  Completion,
  CompletionContext,
  CompletionResult,
  snippet,
} from "@codemirror/autocomplete";
import { ensureSyntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { SyntaxNode, Tree } from "@lezer/common";
import { FountainParseResult } from "../../impower-script-parser";
import { colors } from "../constants/colors";

const snip = (template: string, completion: Completion): Completion => {
  return { ...completion, apply: snippet(template) };
};

type CompletionType =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "variable"
  | "constant"
  | "type"
  | "enum"
  | "property"
  | "keyword"
  | "namespace"
  | "text"
  | "section"
  | "parent"
  | "child"
  | "end"
  | "next"
  | "asset"
  | "entity"
  | "tag"
  | "character"
  | "transition"
  | "scene";

const getAncestorIds = (sectionId: string): string[] => {
  const parts = sectionId.split(".");
  const partsCount = parts.length - 1;
  const ids: string[] = [sectionId];
  for (let i = 0; i < partsCount; i += 1) {
    parts.pop();
    ids.push(parts.join("."));
  }
  return ids;
};

export const paragraphSnippets: readonly Completion[] = [
  snip("var ${}${newVariable} = ${value}${}", {
    label: "variable",
    type: "variable",
  }),
  snip("tag ${}${newTag} = `${value}`${}", {
    label: "section",
    type: "section",
  }),
  snip("image ${}${newImage} = `${url}`${}", {
    label: "image",
    type: "asset",
  }),
  snip("audio ${}${newAudio} = `${url}`${}", {
    label: "audio",
    type: "asset",
  }),
  snip("video ${}${newVideo} = `${url}`${}", {
    label: "video",
    type: "asset",
  }),
  snip("text ${}${newText} = `${url}`${}", {
    label: "text",
    type: "asset",
  }),
  snip("enum ${}${NewElement}:${}", {
    label: "enum",
    type: "entity",
  }),
  snip("object ${}${NewComponent}:${}", {
    label: "object",
    type: "entity",
  }),
  snip("ui ${}${NewElement}:${}", {
    label: "ui",
    type: "entity",
  }),
];

export const effectSnippets: readonly Completion[] = [
  snip("shake${}", {
    label: "shake",
    type: "class",
  }),
  snip("shake-v${}", {
    label: "shake-v",
    type: "class",
  }),
  snip("shake-h${}", {
    label: "shake-h",
    type: "class",
  }),
  snip("color:${}${blue}${}", {
    label: "color",
    type: "class",
  }),
  snip("speed:${}${0.5}${}", {
    label: "speed",
    type: "class",
  }),
];

export const callSnippets: readonly Completion[] = [
  snip("* spawn(${}${entityName})${}", {
    label: "* spawn",
    detail: "(e)",
    type: "method",
  }),
  snip("* destroy(${}${entityName})${}", {
    label: "* destroy",
    detail: "(e)",
    type: "method",
  }),
  snip("* move(${}${entityName}, ${x}, ${y})${}", {
    label: "* move",
    detail: "(e,x,y)",
    type: "method",
  }),
  snip("* moveX(${}${entityName}, ${x})${}", {
    label: "* moveX",
    detail: "(e,x)",
    type: "method",
  }),
  snip("* moveY(${}${entityName}, ${y})${}", {
    label: "* moveY",
    detail: "(e,y)",
    type: "method",
  }),
];

export const transitionSnippets: readonly Completion[] = [
  snip("${}CUT${}", {
    label: "CUT",
    type: "transition",
  }),
  snip("${}HARD CUT${}", {
    label: "HARD CUT",
    type: "transition",
  }),
  snip("${}SMASH CUT${}", {
    label: "SMASH CUT",
    type: "transition",
  }),
  snip("${}TIME CUT${}", {
    label: "TIME CUT",
    type: "transition",
  }),
  snip("${}MATCH CUT${}", {
    label: "MATCH CUT",
    type: "transition",
  }),
  snip("${}FLASH CUT${}", {
    label: "FLASH CUT",
    type: "transition",
  }),
  snip("${}FADE${}", {
    label: "FADE",
    type: "transition",
  }),
  snip("${}DISSOLVE${}", {
    label: "DISSOLVE",
    type: "transition",
  }),
];

export const scenePrefixSnippets: readonly Completion[] = [
  snip("${}INT", {
    label: "INT",
    type: "scene",
    info: "(interior scene)",
  }),
  snip("${}EXT", {
    label: "EXT",
    type: "scene",
    info: "(exterior scene)",
  }),
  snip("${}INT/EXT", {
    label: "INT/EXT",
    type: "scene",
    info: "(intercut between interior and exterior)",
  }),
];

export const nameSnippets = (
  options: string[] | { name: string; type: string; value: string }[],
  completionType: CompletionType,
  prefix = "",
  suffix = "",
  color?: string
): Completion[] => {
  return options.map((option) => {
    const name = typeof option === "string" ? option : option.name;
    const info =
      typeof option === "string"
        ? undefined
        : (): Node => {
            const preview = document.createElement("div");
            const content = document.createTextNode(`${option.type}`);
            preview.appendChild(content);
            preview.style.color = color;
            return preview;
          };
    return snip(prefix + name + suffix, {
      label: prefix + name,
      info,
      type: completionType,
    });
  });
};

export const assignOrCallSnippets = (
  variableOptions: { name: string; type: string; value: string }[]
): Completion[] => {
  const snippets = [
    ...nameSnippets(variableOptions, "variable", "* ", " ${}", colors.variable),
    ...callSnippets,
  ];
  return snippets.map((s, i) => ({ ...s, boost: snippets.length - i }));
};

export const getSectionOptions = (
  ancestorIds: string[],
  children: string[]
): string[] => {
  const childrenNames = children.map((id) => id.split(".").slice(-1).join(""));
  return [...childrenNames, "", ...ancestorIds.slice(0, -1), "!END"];
};

export const sectionSnippets = (
  ancestorIds: string[],
  children: string[],
  prefix: string | string[] = "",
  suffix: string | string[] = ""
): Completion[] => {
  const options = getSectionOptions(ancestorIds, children);
  const prefixes = typeof prefix === "string" ? [prefix] : prefix;
  const labelCleanupRegex = /[\n\r${}]/g;
  return prefixes.flatMap((prefix, prefixIndex) =>
    options.map((option, optionIndex) =>
      snip(prefix + option + suffix, {
        label:
          prefix.replace(labelCleanupRegex, "") +
          option +
          (typeof suffix === "string"
            ? suffix.replace(labelCleanupRegex, "")
            : suffix[prefixIndex].replace(labelCleanupRegex, "")),
        type: option.includes("!END")
          ? "end"
          : option.includes(".")
          ? "parent"
          : !option
          ? "next"
          : "child",
        boost: options.length - optionIndex,
      })
    )
  );
};

export const sectionHeaderSnippets = (level: number): Completion[] => {
  const result: Completion[] = [];
  for (let i = level + 1; i >= 0; i -= 1) {
    const child = i === level + 1;
    const operator = "#".repeat(i);
    const name = child ? `ChildSection` : `Section`;
    result.push(
      snip(`${operator} \${${name}}`, {
        label: `${operator}`,
        detail: `${name}`,
        type: child ? "child" : "parent",
      })
    );
  }
  return result;
};

export const characterSnippets = (
  characters: string[],
  dialogueLines: Record<number, string>,
  line: number,
  suffix = ""
): Completion[] => {
  const recentCharactersSet = new Set<string>();
  if (dialogueLines) {
    for (let i = line - 1; i >= 0; i -= 1) {
      const dialogueLine = dialogueLines[i];
      if (dialogueLine) {
        recentCharactersSet.add(dialogueLine);
        if (recentCharactersSet.size >= characters.length) {
          break;
        }
      }
    }
  }
  const recentCharacters = Array.from(recentCharactersSet);
  if (recentCharacters.length > 1) {
    const mostRecentCharacter = recentCharacters.shift();
    recentCharacters.splice(1, 0, mostRecentCharacter);
  }
  const result: Completion[] = [];
  recentCharacters.forEach((name, index) => {
    result.push(
      snip(`${name + suffix}`, {
        label: name,
        type: "character",
        boost: recentCharacters.length - index,
      })
    );
  });
  characters.forEach((name) => {
    if (!recentCharactersSet.has(name)) {
      result.push(
        snip(`${name + suffix}`, {
          label: name,
          type: "character",
        })
      );
    }
  });
  return result;
};

export const assetSnippets = (
  assets: { name: string; type?: string; value?: string }[]
): Completion[] => {
  return assets.map(({ name, type, value }) =>
    snip(name, {
      label: name,
      type: "function",
      info: () => {
        const preview = document.createElement(
          type === "audio" ? "audio" : "img"
        );
        const fileUrl = value;
        const rgx = /%2F([0-9][0-9][0-9])[?]/;
        const match = fileUrl.match(rgx);
        const storageName = match?.[1];
        const previewPrefix = "THUMB_";
        const previewUrl =
          match && type === "image"
            ? fileUrl.replace(rgx, `%2F${previewPrefix}${storageName}?`)
            : undefined;
        preview.src = previewUrl || fileUrl;
        preview.style.width = "100px";
        preview.style.height = "100px";
        preview.style.objectFit = "contain";
        preview.style.backgroundColor = "white";
        return preview;
      },
    })
  );
};

const getSectionInfo = (node: SyntaxNode): { level: number; from: number } => {
  const positions = new Set<number>();
  let from = 0;
  for (
    let cur: SyntaxNode | null = node;
    cur && cur.name !== "Document";
    cur = cur.parent
  ) {
    if (cur.name === "Section") {
      positions.add(cur.from);
      if (cur.from > from) {
        from = cur.from;
      }
    }
  }
  return { level: positions.size, from };
};

export const fountainAutocomplete = async (
  context: CompletionContext,
  parseContext: { result: FountainParseResult }
): Promise<CompletionResult> => {
  const { result } = parseContext;
  const requestTree = (
    onTreeReady: (value: Tree | PromiseLike<Tree>) => void
  ): number => {
    const t = ensureSyntaxTree(context.state, context.pos, 5000);
    if (t) {
      onTreeReady(t);
    }
    const loop = (): void => {
      const ready = syntaxTreeAvailable(context.state, context.pos);
      if (ready) {
        onTreeReady(ensureSyntaxTree(context.state, context.pos));
      } else {
        window.requestAnimationFrame(loop);
      }
    };
    return window.requestAnimationFrame(loop);
  };
  const tree = await new Promise<Tree>((resolve) => {
    requestTree(resolve);
  });
  const node: SyntaxNode = tree.resolveInner(context.pos, -1);
  const input = context.state.sliceDoc(node.from, node.to);
  const line = context.state.doc.lineAt(node.from).number;
  const sectionInfo = getSectionInfo(node);
  const sectionLevel = sectionInfo.level;
  const sectionFrom = sectionInfo.from;
  const sectionLineNumber = context.state.doc.lineAt(sectionFrom).number;
  const sectionId = result.sectionLines?.[sectionLineNumber];
  const section = result.sections?.[sectionId];
  const children = section?.children || [];
  const ancestorIds = getAncestorIds(sectionId);
  const variableOptions = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].variables || {}).map((id) => {
      const found = result.sections[ancestorId].variables[id];
      return {
        name: found.name,
        type: found.type,
        value: found.valueText,
      };
    })
  );
  const entityOptions = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].entities || {}).map((id) => {
      const found = result.sections[ancestorId].entities[id];
      return {
        name: found.name,
        type: found.type,
        value: found.valueText,
      };
    })
  );
  const assetOptions = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].assets || {}).map((id) => {
      const found = result.sections[ancestorId].assets[id];
      return {
        name: found.name,
        type: found.type,
        value: found.valueText,
      };
    })
  );
  const tagOptions = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].tags || {}).map((id) => {
      const found = result.sections[ancestorId].tags[id];
      return {
        name: found.name,
        type: "tag",
        value: found.valueText,
      };
    })
  );
  const isLowercase = input.toLowerCase() === input;
  const completions: Completion[] = [];
  if (node.name === "Paragraph") {
    if (isLowercase && input.match(/^[\w]+/)) {
      completions.push(...paragraphSnippets);
    }
    if (input.startsWith("#")) {
      completions.push(...sectionHeaderSnippets(sectionLevel));
    }
  } else if (node.name === "Transition") {
    completions.push(...transitionSnippets);
  } else if (node.name === "ScenePrefix") {
    completions.push(...scenePrefixSnippets);
  } else if (node.name === "SceneLocation") {
    completions.push(
      ...nameSnippets(Object.keys(result.properties?.locations || {}), "scene")
    );
  } else if (node.name === "SceneTime") {
    completions.push(
      ...nameSnippets(Object.keys(result.properties?.times || {}), "scene")
    );
  } else if (
    ["PossibleCharacter", "PossibleCharacterName"].includes(node.name)
  ) {
    completions.push(
      ...characterSnippets(
        Object.keys(result.properties.characters || {}),
        result.dialogueLines,
        line,
        "\n"
      )
    );
  } else if (["Character", "CharacterName"].includes(node.name)) {
    completions.push(
      ...characterSnippets(
        Object.keys(result.properties.characters || {}),
        result.dialogueLines,
        line
      )
    );
  } else if (node.name === "ImageNote") {
    const imageOptions = assetOptions.filter(({ type }) => type === "audio");
    completions.push(...assetSnippets(imageOptions));
  } else if (node.name === "AudioNote") {
    const audioOptions = assetOptions.filter(({ type }) => type === "audio");
    completions.push(...assetSnippets(audioOptions));
  } else if (node.name === "DynamicTag") {
    completions.push(
      ...nameSnippets(tagOptions, "tag", "", "", colors.tag),
      ...effectSnippets
    );
  } else if (["AssignMark", "CallMark"].includes(node.name)) {
    completions.push(...assignOrCallSnippets(variableOptions));
  } else if (node.name === "CallEntityName") {
    completions.push(
      ...nameSnippets(entityOptions, "entity", "", "", colors.entity)
    );
  } else if (node.name === "GoMark") {
    completions.push(...sectionSnippets(ancestorIds, children, "> ", "${}"));
  } else if (node.name === "ChoiceMark") {
    completions.push(
      ...sectionSnippets(
        ancestorIds,
        children,
        ["+ ${}${choice} > ", "- ${}${choice} > "],
        "${}"
      )
    );
  } else if (["GoSectionName", "ChoiceSectionName"].includes(node.name)) {
    completions.push(...sectionSnippets(ancestorIds, children, "${}"));
  } else if (
    [
      "AssignName",
      "ConditionName",
      "ChoiceName",
      "AssignValue",
      "VariableValue",
      "CompareValue",
      "ChoiceValue",
      "ConditionValue",
      "CallValue",
      "ReturnValue",
    ].includes(node.name)
  ) {
    completions.push(
      ...nameSnippets(variableOptions, "variable", "", "", colors.variable)
    );
  }
  const source = completeFromList(completions);
  return source(context);
};
