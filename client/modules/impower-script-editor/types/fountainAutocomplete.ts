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
  FountainAsset,
  FountainParseResult,
} from "../../impower-script-parser";

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
  | "tag";

export const paragraphSnippets: readonly Completion[] = [
  snip("var ${newVariable}", {
    label: "variable",
    type: "keyword",
  }),
  snip("tag ${newTag}", {
    label: "tag",
    type: "keyword",
  }),
  snip("image ${newImage}", {
    label: "image",
    type: "keyword",
  }),
  snip("audio ${newAudio}", {
    label: "audio",
    type: "keyword",
  }),
  snip("video ${newVideo}", {
    label: "video",
    type: "keyword",
  }),
  snip("text ${newText}", {
    label: "text",
    type: "keyword",
  }),
];

export const effectSnippets: readonly Completion[] = [
  snip("shake", {
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
  snip("color:${blue}", {
    label: "color",
    type: "class",
  }),
  snip("speed:${0.5}", {
    label: "speed",
    type: "class",
  }),
];

export const callSnippets: readonly Completion[] = [
  snip("spawn(${entityName})", {
    label: "spawn",
    type: "method",
  }),
  snip("move(${entityName}, ${x}, ${y})", {
    label: "move",
    type: "method",
  }),
  snip("destroy(${entityName})", {
    label: "destroy",
    type: "method",
  }),
];

export const nameSnippets = (
  names: string[],
  type: CompletionType
): Completion[] => {
  return Array.from(new Set(names)).map((name) =>
    snip(name, {
      label: name,
      type,
    })
  );
};

export const sectionSnippets = (level: number): Completion[] => {
  const result: Completion[] = [];
  for (let i = level + 1; i >= 0; i -= 1) {
    const child = i === level + 1;
    const operator = "#".repeat(i);
    const name = "NewSection";
    result.push(
      snip(`${operator} \${${name}}`, {
        label: `${operator}`,
        detail: `${child ? `child section` : ``}`,
        type: "keyword",
      })
    );
  }
  return result;
};

export const characterSnippets = (
  characters: string[],
  dialogueLines: Record<number, string>,
  line: number
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
      snip(`${name}\n`, {
        label: name,
        type: "constant",
        boost: recentCharacters.length - index,
      })
    );
  });
  characters.forEach((name) => {
    if (!recentCharactersSet.has(name)) {
      result.push(
        snip(`${name}\n`, {
          label: name,
          type: "constant",
        })
      );
    }
  });
  return result;
};

export const assetSnippets = (
  assets: [string, FountainAsset][]
): Completion[] => {
  const map: { [name: string]: FountainAsset } = {};
  assets.forEach(([id, asset]) => {
    const name = id.split(".").slice(-1).join(".");
    map[name] = asset;
  });
  return Object.entries(map).map(([name, asset]) =>
    snip(name, {
      label: name,
      type: "function",
      info: () => {
        const preview = document.createElement(
          asset.type === "audio" ? "audio" : "img"
        );
        const fileUrl = asset.value;
        const rgx = /%2F([0-9][0-9][0-9])[?]/;
        const match = fileUrl.match(rgx);
        const storageName = match?.[1];
        const previewPrefix = "THUMB_";
        const previewUrl =
          match && asset.type === "image"
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
  const sectionNames = [
    ...(section?.children || []).map((x) => x.split(".").slice(-1).join("")),
    ...Object.keys(result.sections || {}),
    "!END",
  ];
  const variables = {
    ...(section?.variables || {}),
    ...(result.sections?.[""]?.variables || {}),
  };
  const variableNames = Object.keys(variables).map((x) =>
    x.split(".").slice(-1).join(".")
  );
  const entities = {
    ...(section?.entities || {}),
    ...(result.sections?.[""]?.entities || {}),
  };
  const entityNames = Object.keys(entities).map((x) =>
    x.split(".").slice(-1).join(".")
  );
  const isLowercase = input.toLowerCase() === input;
  const completions: Completion[] = [];
  if (node.name === "Paragraph") {
    if (isLowercase) {
      completions.push(...paragraphSnippets);
    }
    if (input.startsWith("#")) {
      completions.push(...sectionSnippets(sectionLevel));
    }
  } else if (node.name === "CharacterName") {
    completions.push(
      ...characterSnippets(
        Object.keys(result.properties.characters || {}),
        result.dialogueLines,
        line
      )
    );
  } else if (node.name === "ImageNote") {
    const assets = {
      ...(section?.assets || {}),
      ...(result.sections?.[""]?.assets || {}),
    };
    const imageAssets = Object.entries(assets).filter(
      ([, v]) => v.type === "image"
    );
    completions.push(...assetSnippets(imageAssets));
  } else if (node.name === "AudioNote") {
    const assets = {
      ...(section?.assets || {}),
      ...(result.sections?.[""]?.assets || {}),
    };
    const audioAssets = Object.entries(assets).filter(
      ([, v]) => v.type === "audio"
    );
    completions.push(...assetSnippets(audioAssets));
  } else if (node.name === "DynamicTag") {
    const tags = {
      ...(section?.tags || {}),
      ...(result.sections?.[""]?.tags || {}),
    };
    const tagNames = Object.entries(tags).map(([k]) =>
      k.split(".").slice(-1).join(".")
    );
    completions.push(...nameSnippets(tagNames, "type"), ...effectSnippets);
  } else if (node.name === "LogicName") {
    completions.push(
      ...nameSnippets(variableNames, "variable"),
      ...callSnippets
    );
  } else if (node.name === "CallEntityName") {
    completions.push(...nameSnippets(entityNames, "class"));
  } else if (["GoSectionName", "ConditionSectionName"].includes(node.name)) {
    completions.push(...nameSnippets(sectionNames, "tag"));
  } else if (
    [
      "ConditionName",
      "AssignValue",
      "DeclareValue",
      "CompareValue",
      "ConditionValue",
      "CallValue",
      "ConditionValue",
    ].includes(node.name)
  ) {
    completions.push(...nameSnippets(variableNames, "variable"));
  }
  const source = completeFromList(completions);
  return source(context);
};
