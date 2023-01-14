/* eslint-disable no-cond-assign */
/* eslint-disable no-template-curly-in-string */
import {
  completeFromList,
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
  snippet,
} from "@codemirror/autocomplete";
import { ensureSyntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { SyntaxNode, Tree } from "@lezer/common";
import {
  getAllProperties,
  Note,
  Pitch,
  STRUCT_DEFAULTS,
  SynthTrack,
  Tone,
} from "../../../../spark-engine";
import {
  getAncestorIds,
  getChildrenIds,
  getRelativeSection,
  getSectionAt,
  getSiblingIds,
  SparkParseResult,
  sparkRegexes,
  SparkSection,
  SparkStructFieldToken,
} from "../../../../sparkdown";
import { colors } from "../constants/colors";
import { Type } from "../types/type";
import { getSparkValidation } from "./getSparkValidation";

interface Option {
  line: number;
  name: string;
  type: string;
  infoColor?: string;
  completionType?: CompletionType;
}

const CURSOR_OPEN = "${";
const CURSOR_CLOSE = "}";
const CURSOR = CURSOR_OPEN + CURSOR_CLOSE;

const context = new AudioContext();

const playTone = (note: Note, duration: number): void => {
  const tone: Tone = { time: 0, duration, note };
  const track = new SynthTrack([tone], context.sampleRate);
  const buffer = context.createBuffer(
    1,
    track.durationInSamples,
    context.sampleRate
  );
  buffer.copyToChannel(track.soundBuffer, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(context.currentTime + 0.025, 0, duration + 0.05);
};

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

const structTypes = Object.keys(STRUCT_DEFAULTS);

const getInfoNode = (info: string, color?: string): Node => {
  const preview = document.createElement("div");
  if (info) {
    const content = document.createTextNode(info);
    preview.appendChild(content);
    if (color) {
      preview.style.color = color;
    }
    preview.style.fontFamily = "monospace";
    preview.style.fontStyle = "italic";
  }
  return preview;
};

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

export const structSnippets: readonly Completion[] = structTypes.map((type) => {
  const name =
    type === "style"
      ? `${type[0].toUpperCase() + type.slice(1)}Name`
      : `${type.toUpperCase()}_NAME`;
  return snip(
    `@ ${type} ${CURSOR}${CURSOR_OPEN}${name}${CURSOR_CLOSE}:${CURSOR}`,
    {
      label: `@ ${type}`,
      type: "struct",
    }
  );
});

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
  snip("* if ${}", {
    label: "* if",
    type: "condition",
  }),
  snip("* elif ${}", {
    label: "* elif",
    type: "condition",
  }),
  snip("* else${}", {
    label: "* else",
    type: "condition",
  }),
];

export const declareSnippets: readonly Completion[] = [
  snip("* var ${}", {
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

export const getNoteSnippets = (
  keys: Pitch[],
  octaves: number[]
): readonly Completion[] => {
  let i = 0;
  const max = octaves.length * keys.length;
  return octaves.flatMap((octave) => {
    return keys.flatMap((note) => {
      const template = `${note}${octave}${CURSOR}${CURSOR}`;
      const s = snip(template, {
        label: `${note}${octave}`,
        info: (): Node => {
          playTone(`${note}${octave}`, 0.05);
          return document.createElement("div");
        },
        type: `tone`,
        boost: max - i,
      });
      i += 1;
      return s;
    });
  });
};

export const nameSnippets = (
  options: (
    | string
    | {
        name: string;
        type: string;
        infoColor?: string;
        completionType?: CompletionType;
      }
  )[],
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
  references: { name: string; value: unknown }[],
  type: string
): Completion[] => {
  return references.map(({ name, value }) =>
    snip(name, {
      label: name,
      type: "function",
      info: () => {
        const fileUrl = value as string;
        const preview = document.createElement(
          type === "image" ? "img" : type
        ) as HTMLImageElement;
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

export const allFromList = (
  list: readonly (string | Completion)[],
  limit = 50
): CompletionSource => {
  const options = list.map((o) =>
    typeof o === "string" ? { label: o } : o
  ) as Completion[];
  return (context: CompletionContext): CompletionResult | null => {
    return {
      from: context.pos,
      options: options.length > limit ? options.slice(0, limit) : options,
      filter: false,
      validFor: () => false,
    };
  };
};

export const sparkAutocomplete = async (
  context: CompletionContext,
  parseContext: {
    result: SparkParseResult;
  }
): Promise<CompletionResult> => {
  const { result } = parseContext;
  const objectMap = result?.objectMap || {};
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
  const line = context.state.doc.lineAt(node.from);
  const lineNumber = line.number;
  const [sectionId, section] = getSectionAt(node.from, result);
  const sectionLevel = section?.level || 0;
  const ancestorIds = getAncestorIds(sectionId);
  const variableOptions: Option[] = ancestorIds.flatMap((ancestorId) =>
    Object.entries(result?.sections?.[ancestorId]?.variables || {}).map(
      ([id]) => {
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
      }
    )
  );
  const isUppercase = input.toUpperCase() === input;

  if ([Type.RepeatMark].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(...repeatSnippets);
    return completeFromList(completions)(context);
  }
  if ([Type.Paragraph, Type.Action].includes(node.type.id)) {
    const completions: Completion[] = [];
    if (input.match(/^[\w]+/)) {
      if (isUppercase) {
        completions.push(...uppercaseParagraphSnippets);
      }
    }
    if (input.startsWith("#")) {
      completions.push(...sectionHeaderSnippets(sectionLevel));
    }
    return completeFromList(completions)(context);
  }
  if (
    [
      Type.Section,
      Type.SectionMark,
      Type.PossibleSection,
      Type.PossibleSectionMark,
    ].includes(node.type.id)
  ) {
    const completions: Completion[] = [];
    completions.push(...sectionHeaderSnippets(sectionLevel));
    return completeFromList(completions)(context);
  }
  if ([Type.ChoiceMark].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(...choiceSnippets);
    return completeFromList(completions)(context);
  }
  if ([Type.Transition].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(...transitionSnippets);
    return completeFromList(completions)(context);
  }
  if ([Type.ScenePrefix].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(...scenePrefixSnippets);
    return completeFromList(completions)(context);
  }
  if ([Type.SceneLocation].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(
      ...nameSnippets(Object.keys(result?.properties?.locations || {}), "scene")
    );
    return completeFromList(completions)(context);
  }
  if ([Type.SceneTime].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(
      ...nameSnippets(Object.keys(result?.properties?.times || {}), "scene")
    );
    return completeFromList(completions)(context);
  }
  if ([Type.PossibleCharacter].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(
      ...characterSnippets(
        Object.keys(result?.properties?.characters || {}),
        result?.dialogueLines,
        lineNumber,
        "\n"
      )
    );
    completions.push(...uppercaseParagraphSnippets);
    return completeFromList(completions)(context);
  }
  if ([Type.PossibleCharacterName].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(
      ...characterSnippets(
        Object.keys(result?.properties?.characters || {}),
        result?.dialogueLines,
        lineNumber,
        "\n"
      )
    );
    return completeFromList(completions)(context);
  }
  if ([Type.Character, Type.CharacterName].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(
      ...characterSnippets(
        Object.keys(result?.properties?.characters || {}),
        result?.dialogueLines,
        lineNumber
      )
    );
    return completeFromList(completions)(context);
  }
  if ([Type.ImageNote].includes(node.type.id)) {
    const completions: Completion[] = [];
    const validOptions = Object.entries(result?.objectMap?.image || {}).map(
      ([structName, struct]) => {
        return {
          name: structName,
          value: struct?.src || "",
        };
      }
    );
    completions.push(...assetSnippets(validOptions, "image"));
    return completeFromList(completions)(context);
  }
  if ([Type.AudioNote].includes(node.type.id)) {
    const completions: Completion[] = [];
    const validOptions = Object.entries(result?.objectMap?.audio || {}).map(
      ([structName, struct]) => {
        return {
          name: structName,
          value: struct?.src || "",
        };
      }
    );
    completions.push(...assetSnippets(validOptions, "audio"));
    return completeFromList(completions)(context);
  }
  if (node.type.id === Type.DynamicTag) {
    const completions: Completion[] = [];
    const validOptions = Object.entries(result?.objectMap?.tag || {}).map(
      ([, struct]) => {
        return {
          type: "tag",
          name: struct.name,
          value: struct?.content || "",
        };
      }
    );
    completions.push(
      ...nameSnippets(validOptions, "tag", "", "", colors.tag),
      ...effectSnippets
    );
    return completeFromList(completions)(context);
  }
  if ([Type.StructMark].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(...structSnippets);
    return completeFromList(completions)(context);
  }
  if ([Type.StructFieldName].includes(node.type.id)) {
    const tokenIndex = result.tokenLines[line.number];
    const structField = result.tokens[tokenIndex] as SparkStructFieldToken;
    const structName = structField?.struct;
    const fieldId = structField?.id;
    const struct = result.structs[structName || ""];
    const structType = struct?.type;
    const defaultStructObj = STRUCT_DEFAULTS[structType]?.[""];
    if (defaultStructObj) {
      const properties = getAllProperties(defaultStructObj);
      const possibleNames: Record<string, unknown> = {};
      Object.entries(properties).forEach(([p, defaultValue]) => {
        if (p.startsWith(fieldId) && !Object.keys(struct.fields).includes(p)) {
          const k = p.slice(fieldId.length);
          const path = k.split(".");
          const name = path[1];
          const field = path[2];
          const isObject = field !== undefined;
          possibleNames[name] = isObject ? undefined : defaultValue;
        }
      });
      const completions = Object.entries(possibleNames).map(
        ([name, defaultValue]) => {
          const type =
            defaultValue == null
              ? "object"
              : Array.isArray(defaultValue)
              ? "array"
              : typeof defaultValue;
          const template =
            type === "object" || type === "array"
              ? `${name}:\n  ${CURSOR}`
              : `${name}: ${CURSOR}`;
          return snip(template, {
            label: name,
            type,
          });
        }
      );
      return completeFromList(completions)(context);
    }
  }
  if ([Type.StructFieldValue].includes(node.type.id)) {
    const isStartOfString = [`""`, `''`, "''"].includes(input);
    const isPossiblyStartOfBoolean = [`t`, `f`].includes(input);
    if (isStartOfString || isPossiblyStartOfBoolean) {
      const tokenIndex = result.tokenLines[line.number];
      const structField = result.tokens[tokenIndex] as SparkStructFieldToken;
      const structName = structField?.struct;
      const fieldId = structField?.id;
      const defaultValue = structField?.valueText;
      const struct = result.structs[structName || ""];
      const structType = struct?.type;
      const validation = getSparkValidation(structType, objectMap)?.validation;
      if (validation) {
        const requirements = getAllProperties(validation);
        const requirement = requirements[fieldId];
        if (requirement) {
          const validOptions =
            typeof defaultValue === "boolean"
              ? [true, false]
              : typeof defaultValue === "string" && Array.isArray(requirement)
              ? requirement
              : [];
          const completions = validOptions?.map((option) => {
            const o = `${option}`;
            return snip(o, {
              label: o,
              type: "option",
            });
          });
          if (isStartOfString) {
            return allFromList(completions)(context);
          }
          return completeFromList(completions)(context);
        }
      }
    }
  }
  if (
    [Type.AssignMark, Type.CallMark, Type.VariableMark].includes(node.type.id)
  ) {
    const completions: Completion[] = [];
    completions.push(
      ...logicSnippets(variableOptions, sectionId, result?.sections)
    );
    return completeFromList(completions)(context);
  }
  if ([Type.JumpMark, Type.ChoiceJumpMark].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(...sectionSnippets(sectionId, result?.sections, "> "));
    return completeFromList(completions)(context);
  }
  if ([Type.JumpSectionName, Type.ChoiceSectionName].includes(node.type.id)) {
    const completions: Completion[] = [];
    completions.push(...sectionSnippets(sectionId, result?.sections));
    return completeFromList(completions)(context);
  }
  if ([Type.CallEntityName].includes(node.type.id)) {
    const completions: Completion[] = [];
    const entityOptions = Object.keys(result?.objectMap?.entity || {}).map(
      (name) => {
        return {
          name,
          type: "entity",
        };
      }
    );
    const validOptions = entityOptions.filter((x) => x.type === "image");
    if (input.match(sparkRegexes.string)) {
      completions.push(
        ...nameSnippets(validOptions, "entity", "", "", colors.struct)
      );
    }
    return completeFromList(completions)(context);
  }
  if ([Type.VariableValue].includes(node.type.id)) {
    const completions: Completion[] = [];
    const validVariableOptions = variableOptions.filter(
      (x) => x.line !== lineNumber
    );
    completions.push(
      ...nameSnippets(
        validVariableOptions,
        "variable",
        "",
        "",
        colors.variableName
      )
    );
    return completeFromList(completions)(context);
  }
  if (
    [
      Type.AssignName,
      Type.AssignValue,
      Type.CallValue,
      Type.JumpValue,
      Type.ReturnValue,
      Type.ConditionValue,
      Type.SectionParameterValue,
      Type.SectionVariableName,
      Type.InterpolationVariableName,
    ].includes(node.type.id)
  ) {
    const completions: Completion[] = [];
    completions.push(
      ...nameSnippets(variableOptions, "variable", "", "", colors.variableName)
    );
    return completeFromList(completions)(context);
  }
  return completeFromList([])(context);
};
