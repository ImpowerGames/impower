/* eslint-disable no-cond-assign */
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
  getAncestorIds,
  getChildrenIds,
  getRelativeSection,
  getScopedContext,
  getSectionAt,
  getSiblingIds,
  isAssetType,
  isTagType,
  SparkParseResult,
  sparkRegexes,
  SparkSection,
} from "../../../../sparkdown";
import { colors } from "../constants/colors";

interface Option {
  line: number;
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
  | "struct"
  | "entity"
  | "tag"
  | "character"
  | "transition"
  | "scene"
  | "condition"
  | "first_sibling"
  | "last_sibling"
  | "choice_plus"
  | "choice_minus";

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
  snip("list ${}${ListName}:${}", {
    label: "list",
    type: "struct",
  }),
  snip("map ${}${MapName}:${}", {
    label: "map",
    type: "struct",
  }),
  snip("config ${}${ConfigName}:${}", {
    label: "config",
    type: "struct",
  }),
  snip("ui ${}${UIName}:${}", {
    label: "ui",
    type: "struct",
  }),
  snip("style ${}${StyleName}:${}", {
    label: "style",
    type: "struct",
  }),
  snip("camera ${}${CameraName}:${}", {
    label: "camera",
    type: "struct",
  }),
  snip("entity ${}${EntityName}:${}", {
    label: "entity",
    type: "struct",
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

export const declareSnippets: readonly Completion[] = [
  snip("* var ${}${variableName} = ${value}", {
    label: "* var",
    type: "type",
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
  snip('* move(${}"${entityName}", ${x}, ${y}, ${z})${}', {
    label: "* move",
    info: (): Node =>
      getInfoNode(`(string, number, number, number)`, colors.section),
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
  snip('* moveZ(${}"${entityName}", ${z})${}', {
    label: "* moveZ",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
  snip('* rotate(${}"${entityName}", ${x}, ${y}, ${z})${}', {
    label: "* rotate",
    info: (): Node => getInfoNode(`(string, number, number)`, colors.section),
    type: "method",
  }),
  snip('* rotateX(${}"${entityName}", ${x})${}', {
    label: "* rotateX",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
  snip('* rotateY(${}"${entityName}", ${y})${}', {
    label: "* rotateY",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
  snip('* rotateZ(${}"${entityName}", ${z})${}', {
    label: "* rotateY",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
  snip('* scale(${}"${entityName}", ${x}, ${y})${}', {
    label: "* scale",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
  snip('* scaleX(${}"${entityName}", ${x})${}', {
    label: "* scaleX",
    info: (): Node => getInfoNode(`(string, number)`, colors.section),
    type: "method",
  }),
  snip('* scaleY(${}"${entityName}", ${y})${}', {
    label: "* scaleY",
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

export const choiceSnippets: readonly Completion[] = [
  snip("+ ${}", {
    label: "+ choice",
    info: (): Node => getInfoNode(`(always shown)`),
    type: "choice_plus",
  }),
  snip("- ${}", {
    label: "- choice",
    info: (): Node => getInfoNode(`(if chosen, won't be shown again)`),
    type: "choice_minus",
  }),
];

export const nameSnippets = (
  options: (string | Option)[],
  completionType: CompletionType,
  prefix = "",
  suffix = "",
  infoColor: string = undefined
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
  sectionId: string,
  sections: Record<string, SparkSection>
): string[] => {
  const validChildrenIds = getChildrenIds(sectionId, sections).filter(
    (id) => sections?.[id]?.type === "function"
  );
  const validSiblingIds = getSiblingIds(sectionId, sections).filter(
    (id) => sections?.[id]?.type === "function"
  );
  const validRootIds = getChildrenIds("", sections).filter(
    (id) => sections?.[id]?.type === "function"
  );
  return [...validChildrenIds, ...validSiblingIds, ...validRootIds];
};

export const getSectionOptions = (
  sectionId: string,
  sections: Record<string, SparkSection>,
  prefix: string,
  suffix: string
): {
  template: string;
  label: string;
  type: CompletionType;
  detail?: string;
  info?: string | ((completion: Completion) => Node | Promise<Node>);
}[] => {
  const validChildrenIds = getChildrenIds(sectionId, sections).filter(
    (id) =>
      sections?.[id]?.parent === sectionId &&
      ["section", "method"].includes(sections?.[id]?.type)
  );
  const validSiblingIds = getSiblingIds(sectionId, sections).filter(
    (id) =>
      sections?.[id]?.parent !== sectionId &&
      ["section", "method"].includes(sections?.[id]?.type)
  );
  const validAncestorIds = getAncestorIds(sectionId).filter(
    (id) =>
      sections?.[id]?.parent !== sectionId &&
      ["section", "method"].includes(sections?.[id]?.type)
  );
  const [, parent] = getRelativeSection(sectionId, sections, "^");
  const parentName = parent?.name;
  const [, firstSibling] = getRelativeSection(sectionId, sections, "[");
  const firstSiblingName = firstSibling?.name;
  const [, lastSibling] = getRelativeSection(sectionId, sections, "]");
  const lastSiblingName = lastSibling?.name;
  const [, next] = getRelativeSection(sectionId, sections, ">");
  const nextName = next?.name;

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

  const label = "";
  result.push({
    template: prefix + label + suffix,
    label: cleanedPrefix + label + cleanedSuffix,
    detail: " (continue)",
    type: "next",
  });
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
    const label = ">";
    result.push({
      template: prefix + label + suffix,
      label: cleanedPrefix + label + cleanedSuffix,
      detail: "(next section)",
      info: (): Node => getInfoNode(`= ${nextName}`, colors.section),
      type: "next",
    });
  }
  const getSectionOption = (
    id: string
  ): {
    name: string;
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
      name: section?.name,
      template,
      label: cleanedPrefix + label + cleanedSuffix,
      info: infoLabel
        ? (): Node => getInfoNode(infoLabel, colors.section)
        : undefined,
    };
  };
  validChildrenIds.forEach((id) => {
    if (id && id !== sectionId) {
      const { name, template, label, info } = getSectionOption(id);
      if (name) {
        result.push({
          template,
          label,
          info,
          type: "child",
        });
      }
    }
  });
  validSiblingIds.forEach((id) => {
    if (id && id !== sectionId) {
      const { name, template, label, info } = getSectionOption(id);
      if (name) {
        result.push({
          template,
          label,
          info,
          type:
            validSiblingIds.indexOf(id) > validSiblingIds.indexOf(sectionId)
              ? "last_sibling"
              : "first_sibling",
        });
      }
    }
  });
  validAncestorIds.forEach((id) => {
    if (id && id !== sectionId) {
      const { name, template, label, info } = getSectionOption(id);
      if (name) {
        result.push({
          template,
          label,
          info,
          type: "ancestor",
        });
      }
    }
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

export const logicSnippets = (
  variableOptions: Option[],
  sectionId: string,
  sections: Record<string, SparkSection>
): Completion[] => {
  const functionIds = getFunctionIds(sectionId, sections);
  const snippets = [
    ...declareSnippets,
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
  sectionId: string,
  sections: Record<string, SparkSection>,
  prefix = "",
  suffix = ""
): Completion[] => {
  const options = getSectionOptions(sectionId, sections, prefix, suffix);
  return options.map(({ template, label, type, detail, info }, optionIndex) => {
    return {
      ...snip(template, {
        label,
        type,
        detail,
        info,
        boost: options.length - optionIndex,
      }),
      inline: true,
    };
  });
};

export const sectionHeaderSnippets = (level: number): Completion[] => {
  const result: Completion[] = [];
  for (let i = level + 1; i >= 0; i -= 1) {
    const child = i === level + 1;
    const operator = "#".repeat(i);
    const detail =
      level === 0 ? `RootSection` : child ? `ChildSection` : `NewSection`;
    result.push(
      snip(`${operator} \${${detail}}`, {
        label: `${operator}`,
        detail: `${detail}`,
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
  type: "image" | "audio" | "video" | "text" | "graphic"
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
          match && (type === "image" || type === "graphic")
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

export const sparkAutocomplete = async (
  context: CompletionContext,
  parseContext: { result: SparkParseResult }
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
  const [sectionId, section] = getSectionAt(node.from, result);
  const sectionLevel = section?.level || 0;
  const ancestorIds = getAncestorIds(sectionId);
  const [, variables] = getScopedContext<string>(
    sectionId,
    result?.sections,
    "variables"
  );
  const variableOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.entries(result?.sections?.[ancestorId]?.variables || {})
      .filter(([, v]) => !isAssetType(v.type) && !isTagType(v.type))
      .map(([id]) => {
        const found = result?.sections?.[ancestorId]?.variables?.[id];
        const completionType: CompletionType = found.parameter
          ? "parameter"
          : "variable";
        const infoColor = found.parameter
          ? colors.parameterName
          : colors.variableName;
        return {
          line: found.line,
          name: found.name,
          type: found.type,
          completionType,
          infoColor,
        };
      })
  );
  const entityOptions: Option[] = Object.keys(result?.structs || {}).map(
    (id) => {
      const found = result?.structs?.[id];
      return {
        line: found.line,
        name: found.name,
        type: found.type,
      };
    }
  );
  const assetOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.entries(result?.sections?.[ancestorId]?.variables || {})
      .filter(([, v]) => isAssetType(v.type))
      .map(([id]) => {
        const found = result?.sections?.[ancestorId]?.variables?.[id];
        return {
          line: found.line,
          name: found.name,
          type: found.type,
        };
      })
  );
  const tagOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.entries(result?.sections?.[ancestorId]?.variables || {})
      .filter(([, v]) => isTagType(v.type))
      .map(([id]) => {
        const found = result?.sections?.[ancestorId]?.variables?.[id];
        return {
          line: found.line,
          name: found.name,
          type: "tag",
        };
      })
  );
  const isLowercase = input.toLowerCase() === input;
  const isUppercase = input.toUpperCase() === input;
  const completions: Completion[] = [];
  if (["RepeatMark"].includes(node.name)) {
    completions.push(...repeatSnippets);
  }
  if (["Paragraph", "Action"].includes(node.name)) {
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
  } else if (["ChoiceMark"].includes(node.name)) {
    completions.push(...choiceSnippets);
  } else if (["Transition"].includes(node.name)) {
    completions.push(...transitionSnippets);
  } else if (["ScenePrefix"].includes(node.name)) {
    completions.push(...scenePrefixSnippets);
  } else if (["SceneLocation"].includes(node.name)) {
    completions.push(
      ...nameSnippets(Object.keys(result?.properties?.locations || {}), "scene")
    );
  } else if (["SceneTime"].includes(node.name)) {
    completions.push(
      ...nameSnippets(Object.keys(result?.properties?.times || {}), "scene")
    );
  } else if (["PossibleCharacter"].includes(node.name)) {
    completions.push(
      ...characterSnippets(
        Object.keys(result?.properties?.characters || {}),
        result?.dialogueLines,
        line,
        "\n"
      )
    );
    completions.push(...uppercaseParagraphSnippets);
  } else if (["PossibleCharacterName"].includes(node.name)) {
    completions.push(
      ...characterSnippets(
        Object.keys(result?.properties?.characters || {}),
        result?.dialogueLines,
        line,
        "\n"
      )
    );
  } else if (["Character", "CharacterName"].includes(node.name)) {
    completions.push(
      ...characterSnippets(
        Object.keys(result?.properties?.characters || {}),
        result?.dialogueLines,
        line
      )
    );
  } else if (["ImageNote"].includes(node.name)) {
    const validOptions = assetOptions.filter(
      (x) => x.type === "image" || x.type === "graphic"
    );
    completions.push(...assetSnippets(validOptions, variables, "image"));
  } else if (["AudioNote"].includes(node.name)) {
    const validOptions = assetOptions.filter((x) => x.type === "audio");
    completions.push(...assetSnippets(validOptions, variables, "audio"));
  } else if (node.name === "DynamicTag") {
    completions.push(
      ...nameSnippets(tagOptions, "tag", "", "", colors.tag),
      ...effectSnippets
    );
  } else if (["AssignMark", "CallMark", "VariableMark"].includes(node.name)) {
    completions.push(
      ...logicSnippets(variableOptions, sectionId, result?.sections)
    );
  } else if (["GoMark", "ChoiceGoMark"].includes(node.name)) {
    completions.push(...sectionSnippets(sectionId, result?.sections, "> "));
  } else if (["GoSectionName", "ChoiceSectionName"].includes(node.name)) {
    completions.push(...sectionSnippets(sectionId, result?.sections));
  } else if (["CallEntityName"].includes(node.name)) {
    const validOptions = entityOptions.filter(
      (x) => x.type === "image" || x.type === "graphic"
    );
    if (input.match(sparkRegexes.string)) {
      completions.push(
        ...nameSnippets(validOptions, "entity", "", "", colors.struct)
      );
    }
  } else if (["VariableValue"].includes(node.name)) {
    const validVariableOptions = variableOptions.filter((x) => x.line !== line);
    completions.push(
      ...nameSnippets(
        validVariableOptions,
        "variable",
        "",
        "",
        colors.variableName
      )
    );
  } else if (
    [
      "AssignName",
      "AssignValue",
      "CallValue",
      "GoValue",
      "ReturnValue",
      "ConditionValue",
      "SectionParameterValue",
      "SectionVariableName",
      "InterpolationVariableName",
    ].includes(node.name)
  ) {
    completions.push(
      ...nameSnippets(variableOptions, "variable", "", "", colors.variableName)
    );
  }
  const source = completeFromList(completions);
  return source(context);
};
