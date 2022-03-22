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
import {
  FountainParseResult,
  fountainRegexes,
  FountainSection,
  getAncestorIds,
  getScopedContext,
} from "../../impower-script-parser";
import { colors } from "../constants/colors";

interface Option {
  name: string;
  type: string;
  infoColor?: string;
  completionType?: CompletionType;
}

const snip = (template: string, completion: Completion): Completion => {
  return { ...completion, apply: snippet(template) };
};

type CompletionType =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "parameter"
  | "trigger"
  | "variable"
  | "constant"
  | "type"
  | "enum"
  | "property"
  | "keyword"
  | "namespace"
  | "text"
  | "section"
  | "ancestor"
  | "parent"
  | "child"
  | "quit"
  | "next"
  | "asset"
  | "entity"
  | "tag"
  | "character"
  | "transition"
  | "scene"
  | "condition"
  | "first_sibling"
  | "last_sibling";

const getInfoNode = (info: string, color?: string): Node => {
  const preview = document.createElement("div");
  const content = document.createTextNode(info);
  preview.appendChild(content);
  if (color) {
    preview.style.color = color;
  }
  preview.style.fontFamily = "monospace";
  preview.style.fontStyle = "italic";
  return preview;
};

export const lowercaseParagraphSnippets: readonly Completion[] = [
  snip("var ${}${newVariable}", {
    label: "variable",
    type: "variable",
  }),
  snip("temp ${}${newVariable}", {
    label: "temp variable",
    type: "variable",
  }),
  snip("tag ${}${newTag} = `${value}`${}", {
    label: "tag",
    type: "tag",
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

export const uppercaseParagraphSnippets: readonly Completion[] = [
  snip("INT. ${}${LOCATION} - ${TIME}", {
    label: "INT. LOCATION - TIME",
    type: "scene",
  }),
  snip("EXT. ${}${LOCATION} - ${TIME}", {
    label: "EXT. LOCATION - TIME",
    type: "scene",
  }),
  snip("INT/EXT. ${}${LOCATION} - ${TIME}", {
    label: "INT/EXT. LOCATION - TIME",
    type: "scene",
  }),
  snip("CUT TO:", {
    label: "CUT TO:",
    type: "scene",
  }),
  snip("HARD CUT TO:", {
    label: "HARD CUT TO:",
    type: "transition",
  }),
  snip("SMASH CUT TO:", {
    label: "SMASH CUT TO:",
    type: "transition",
  }),
  snip("TIME CUT TO:", {
    label: "TIME CUT TO:",
    type: "transition",
  }),
  snip("MATCH CUT TO:", {
    label: "MATCH CUT TO:",
    type: "transition",
  }),
  snip("FLASH CUT TO:", {
    label: "FLASH CUT TO:",
    type: "transition",
  }),
  snip("FADE TO:", {
    label: "FADE TO:",
    type: "transition",
  }),
  snip("DISSOLVE TO:", {
    label: "DISSOLVE TO:",
    type: "transition",
  }),
];

export const repeatSnippets: readonly Completion[] = [
  snip("^", {
    label: "^",
    detail: "(repeat this section)",
    type: "top",
  }),
];

export const transitionSnippets: readonly Completion[] = [
  snip("${}CUT", {
    label: "CUT",
    type: "transition",
  }),
  snip("${}HARD CUT", {
    label: "HARD CUT",
    type: "transition",
  }),
  snip("${}SMASH CUT", {
    label: "SMASH CUT",
    type: "transition",
  }),
  snip("${}TIME CUT", {
    label: "TIME CUT",
    type: "transition",
  }),
  snip("${}MATCH CUT", {
    label: "MATCH CUT",
    type: "transition",
  }),
  snip("${}FLASH CUT", {
    label: "FLASH CUT",
    type: "transition",
  }),
  snip("${}FADE", {
    label: "FADE",
    type: "transition",
  }),
  snip("${}DISSOLVE", {
    label: "DISSOLVE",
    type: "transition",
  }),
];

export const effectSnippets: readonly Completion[] = [
  snip("shake${}", {
    label: "shake",
    type: "class",
  }),
  snip("shake-v", {
    label: "shake-v",
    type: "class",
  }),
  snip("shake-h", {
    label: "shake-h",
    type: "class",
  }),
  snip("color:${}${blue}", {
    label: "color",
    type: "class",
  }),
  snip("speed:${}${0.5}", {
    label: "speed",
    type: "class",
  }),
];

export const conditionSnippets: readonly Completion[] = [
  snip("* if (${}${condition}):", {
    label: "* if",
    type: "condition",
  }),
  snip("* elif (${}${condition}):", {
    label: "* elif",
    type: "condition",
  }),
  snip("* else:", {
    label: "* else",
    type: "condition",
  }),
];

export const callSnippets: readonly Completion[] = [
  snip('* spawn(${}"${entityName}")${}', {
    label: "* spawn",
    info: (): Node => getInfoNode(`(string)`, colors.section),
    type: "method",
  }),
  snip('* destroy(${}"${entityName}")${}', {
    label: "* destroy",
    info: (): Node => getInfoNode(`(string)`, colors.section),
    type: "method",
  }),
  snip('* move(${}"${entityName}", ${x}, ${y})${}', {
    label: "* move",
    info: (): Node => getInfoNode(`(string, number, number)`, colors.section),
    type: "method",
  }),
  snip('* moveX(${}"${entityName}", ${x})${}', {
    label: "* moveX",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
  snip('* moveY(${}"${entityName}", ${y})${}', {
    label: "* moveY",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
];

export const scenePrefixSnippets: readonly Completion[] = [
  snip("${}INT", {
    label: "INT",
    type: "scene",
    info: (): Node => getInfoNode(`(interior scene)`),
  }),
  snip("${}EXT", {
    label: "EXT",
    type: "scene",
    info: (): Node => getInfoNode(`(exterior scene)`),
  }),
  snip("${}INT/EXT", {
    label: "INT/EXT",
    type: "scene",
    info: (): Node => getInfoNode(`(intercut between interior and exterior)`),
  }),
];

export const nameSnippets = (
  options: (string | Option)[],
  completionType: CompletionType,
  prefix = "",
  suffix = "",
  infoColor?: string
): Completion[] => {
  const labelCleanupRegex = /[\n\r${}]/g;
  return options.map((option) => {
    const name = typeof option === "string" ? option : option.name;
    const type =
      typeof option === "string"
        ? completionType
        : option?.completionType || completionType;
    const color = typeof option === "string" ? infoColor : option?.infoColor;
    const info =
      typeof option === "string"
        ? undefined
        : (): Node => getInfoNode(`= ${option.type}`, color);
    const cleanedPrefix = prefix.replace(labelCleanupRegex, "");
    return {
      ...snip(prefix + name + suffix, {
        label: cleanedPrefix + name,
        info,
        type,
      }),
      inline: true,
    };
  });
};

export const getFunctionIds = (
  ancestorIds: string[],
  children: string[],
  sections: Record<string, FountainSection>
): string[] => {
  const validChildrenIds = children.filter(
    (id) => sections?.[id]?.type === "function"
  );
  const validAncestorIds = ancestorIds
    .slice(0, -1)
    .filter((id) => sections?.[id]?.type === "function");
  return [...validChildrenIds, ...validAncestorIds];
};

export const getSectionOptions = (
  ancestorIds: string[],
  children: string[],
  sections: Record<string, FountainSection>,
  prefix: string,
  suffix: string
): {
  template: string;
  label: string;
  type: CompletionType;
  detail?: string;
  info?: string | ((completion: Completion) => Node | Promise<Node>);
}[] => {
  const validChildrenIds = children.filter(
    (id) =>
      sections?.[id]?.type === "section" || sections?.[id]?.type === "method"
  );
  const validAncestorIds = ancestorIds
    .slice(0, -1)
    .filter(
      (id) =>
        sections?.[id]?.type === "section" || sections?.[id]?.type === "method"
    );
  const sectionId = ancestorIds?.[0];
  const parentId = ancestorIds?.[1];
  const parentName = sections?.[parentId]?.name;
  const siblings = sections?.[parentId]?.children || [];
  const firstSiblingId = siblings.find(
    (id) => sections?.[id]?.type === "section"
  );
  const firstSiblingName = sections?.[firstSiblingId]?.name;
  const lastSiblingId = [...siblings]
    .reverse()
    .find((id) => sections?.[id]?.type === "section");
  const lastSiblingName = sections?.[lastSiblingId]?.name;
  const sectionIds = Object.keys(sections || {});
  const sectionIndex = sectionIds.indexOf(sectionId);
  const nextId = sectionIds
    .slice(sectionIndex + 1)
    ?.find((id) => sections?.[id]?.type === "section");
  const nextName = sections?.[nextId]?.name;

  const labelCleanupRegex = /[\n\r${}]/g;
  const cleanedPrefix = prefix.replace(labelCleanupRegex, "");
  const cleanedSuffix = suffix.replace(labelCleanupRegex, "");

  const result: {
    template: string;
    label: string;
    type: CompletionType;
    detail?: string;
    info?: string | ((completion: Completion) => Node | Promise<Node>);
  }[] = [];

  if (lastSiblingName) {
    const label = "]";
    result.push({
      template: prefix + label + suffix,
      label: cleanedPrefix + label + cleanedSuffix,
      detail: "(last sibling)",
      info: (): Node => getInfoNode(`= ${lastSiblingName}`, colors.section),
      type: "last_sibling",
    });
  }
  if (firstSiblingName) {
    const label = "[";
    result.push({
      template: prefix + label + suffix,
      label: cleanedPrefix + label + cleanedSuffix,
      detail: "(first sibling)",
      info: (): Node => getInfoNode(`= ${firstSiblingName}`, colors.section),
      type: "first_sibling",
    });
  }
  if (parentName) {
    const label = "^";
    result.push({
      template: prefix + label + suffix,
      label: cleanedPrefix + label + cleanedSuffix,
      detail: "(parent section)",
      info: (): Node => getInfoNode(`= ${parentName}`, colors.section),
      type: "parent",
    });
  }
  if (nextName) {
    const label = "";
    result.push({
      template: prefix + label + suffix,
      label: cleanedPrefix + label + cleanedSuffix,
      detail: " (next section)",
      info: (): Node => getInfoNode(`= ${nextName}`, colors.section),
      type: "next",
    });
  }
  const getSectionOption = (
    id: string
  ): {
    template: string;
    label: string;
    info: string | ((completion: Completion) => Node | Promise<Node>);
  } => {
    const section = sections?.[id];
    const label = section?.name;
    const parameters = Object.values(section?.variables || {}).filter(
      (v) => v.parameter
    );
    const paramsTemplate = parameters.map((p) => `#{${p.name}}`).join(", ");
    const paramsDetail = parameters.map((p) => `${p.type}`).join(", ");
    const template =
      section.type === "method"
        ? `${prefix}${label}(#{}${paramsTemplate})#{}${suffix}`
        : section.type === "function"
        ? `${prefix}${label}(#{}${paramsTemplate})#{}${suffix}`
        : section.type === "detector"
        ? `${prefix}${label}[#{}${paramsTemplate}]#{}${suffix}`
        : prefix + label + suffix;
    const infoLabel =
      section.type === "function"
        ? `(${paramsDetail}): ${section.returnType}`
        : section.type === "method"
        ? `(${paramsDetail})`
        : "";
    return {
      template,
      label: cleanedPrefix + label + cleanedSuffix,
      info: infoLabel
        ? (): Node => getInfoNode(infoLabel, colors.section)
        : undefined,
    };
  };
  validChildrenIds.forEach((id) => {
    const { template, label, info } = getSectionOption(id);
    result.push({
      template,
      label,
      info,
      type: "child",
    });
  });
  validAncestorIds.forEach((id) => {
    const { template, label, info } = getSectionOption(id);
    result.push({
      template,
      label,
      info,
      type: "ancestor",
    });
  });
  const quitLabel = "!QUIT";
  result.push({
    template: prefix + quitLabel + suffix,
    label: cleanedPrefix + quitLabel + cleanedSuffix,
    detail: "(quit game)",
    type: "quit",
  });

  return result;
};

export const assignOrCallSnippets = (
  variableOptions: Option[],
  ancestorIds: string[],
  children: string[],
  sections: Record<string, FountainSection>
): Completion[] => {
  const functionIds = getFunctionIds(ancestorIds, children, sections);
  const snippets = [
    ...conditionSnippets,
    ...nameSnippets(
      variableOptions,
      "variable",
      "* ",
      " = ${}${value}",
      colors.variableName
    ),
    ...functionIds.map((id) => {
      const section = sections[id];
      const name = section?.name;
      const parameters = Object.values(section?.variables || {}).filter(
        (v) => v.parameter
      );
      const paramsTemplate = parameters.map((p) => `#{${p.name}}`).join(", ");
      const paramsDetail = parameters.map((p) => `${p.type}`).join(", ");
      const info = (): Node => getInfoNode(`(${paramsDetail})`, colors.section);
      return snip(`* ${name}(#{}${paramsTemplate})#{}`, {
        label: `* ${name}`,
        info,
        type: "function",
      });
    }),
    ...callSnippets,
  ];
  return snippets.map((s, i) => ({ ...s, boost: snippets.length - i }));
};

export const sectionSnippets = (
  ancestorIds: string[],
  children: string[],
  sections: Record<string, FountainSection>,
  prefix = "",
  suffix = ""
): Completion[] => {
  const options = getSectionOptions(
    ancestorIds,
    children,
    sections,
    prefix,
    suffix
  );
  return options.map(({ template, label, type, detail, info }, optionIndex) => {
    return snip(template, {
      label,
      type,
      detail,
      info,
      boost: options.length - optionIndex,
    });
  });
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
        type: child ? "child" : "ancestor",
        boost: i - level,
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
  references: { name: string }[],
  valueMap: Record<string, string>,
  type: "image" | "audio" | "video" | "text"
): Completion[] => {
  return references.map(({ name }) =>
    snip(name, {
      label: name,
      type: "function",
      info: () => {
        const fileUrl = valueMap[name];
        const preview = document.createElement(
          type === "audio" ? "audio" : "img"
        );
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
  const [, assets] = getScopedContext<string>(
    sectionId,
    result?.sections,
    "assets"
  );
  const variableOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].variables || {}).map((id) => {
      const found = result.sections[ancestorId].variables[id];
      const completionType: CompletionType = found.parameter
        ? "parameter"
        : "variable";
      const infoColor = found.parameter
        ? colors.parameter
        : colors.variableName;
      return {
        name: found.name,
        type: found.type,
        completionType,
        infoColor,
      };
    })
  );
  const entityOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].entities || {}).map((id) => {
      const found = result.sections[ancestorId].entities[id];
      return {
        name: found.name,
        type: found.type,
      };
    })
  );
  const assetOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].assets || {}).map((id) => {
      const found = result.sections[ancestorId].assets[id];
      return {
        name: found.name,
        type: found.type,
      };
    })
  );
  const tagOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.keys(result.sections[ancestorId].tags || {}).map((id) => {
      const found = result.sections[ancestorId].tags[id];
      return {
        name: found.name,
        type: "tag",
      };
    })
  );
  const isLowercase = input.toLowerCase() === input;
  const isUppercase = input.toUpperCase() === input;
  const completions: Completion[] = [];
  if (node.name === "RepeatMark") {
    completions.push(...repeatSnippets);
  }
  if (node.name === "Paragraph") {
    if (input.match(/^[\w]+/)) {
      if (isLowercase) {
        completions.push(...lowercaseParagraphSnippets);
      }
      if (isUppercase) {
        completions.push(...uppercaseParagraphSnippets);
      }
    }
    if (input.startsWith("#")) {
      completions.push(...sectionHeaderSnippets(sectionLevel));
    }
  } else if (
    [
      "Section",
      "SectionMark",
      "PossibleSection",
      "PossibleSectionMark",
    ].includes(node.name)
  ) {
    completions.push(...sectionHeaderSnippets(sectionLevel));
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
  } else if (node.name === "PossibleCharacter") {
    completions.push(
      ...characterSnippets(
        Object.keys(result.properties.characters || {}),
        result.dialogueLines,
        line,
        "\n"
      )
    );
    completions.push(...uppercaseParagraphSnippets);
  } else if (node.name === "PossibleCharacterName") {
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
  } else if (["ImageNote", "AssetImageValue"].includes(node.name)) {
    const typeOptions = assetOptions.filter(({ type }) => type === "image");
    completions.push(...assetSnippets(typeOptions, assets, "image"));
  } else if (["AudioNote", "AssetAudioValue"].includes(node.name)) {
    const typeOptions = assetOptions.filter(({ type }) => type === "audio");
    completions.push(...assetSnippets(typeOptions, assets, "audio"));
  } else if (["VideoNote", "AssetVideoValue"].includes(node.name)) {
    const typeOptions = assetOptions.filter(({ type }) => type === "video");
    completions.push(...assetSnippets(typeOptions, assets, "video"));
  } else if (["TextNote", "AssetTextValue"].includes(node.name)) {
    const typeOptions = assetOptions.filter(({ type }) => type === "text");
    completions.push(...assetSnippets(typeOptions, assets, "text"));
  } else if (node.name === "DynamicTag") {
    completions.push(
      ...nameSnippets(tagOptions, "tag", "", "", colors.tag),
      ...effectSnippets
    );
  } else if (["AssignMark", "CallMark"].includes(node.name)) {
    completions.push(
      ...assignOrCallSnippets(
        variableOptions,
        ancestorIds,
        children,
        result?.sections
      )
    );
  } else if (node.name === "GoMark") {
    completions.push(
      ...sectionSnippets(ancestorIds, children, result?.sections, "> ", "${}")
    );
  } else if (["GoSectionName", "ChoiceSectionName"].includes(node.name)) {
    completions.push(
      ...sectionSnippets(ancestorIds, children, result?.sections, "${}")
    );
  } else if (["CallEntityName"].includes(node.name)) {
    const typeOptions = entityOptions.filter(({ type }) => type === "ui");
    if (input.match(fountainRegexes.string)) {
      completions.push(
        ...nameSnippets(typeOptions, "entity", "", "", colors.entity)
      );
    }
  } else if (
    [
      "AssignName",
      "AssignValue",
      "CallValue",
      "GoValue",
      "ReturnValue",
      "ConditionValue",
    ].includes(node.name)
  ) {
    completions.push(
      ...nameSnippets(variableOptions, "variable", "", "", colors.variableName)
    );
  }
  const source = completeFromList(completions);
  return source(context);
};
