import {
  Choice,
  type Marker,
  Placeholder,
  SnippetParser,
  Text,
  type TextmateSnippet,
  Variable,
} from "../vendor/vscode/snippetParser";

export type SnippetVariables = Readonly<Record<string, string>>;

export interface SnippetTemplate {
  template: string;
  standIns: ReadonlyMap<string, string>;
}

export const SNIPPET_DEGRADATIONS = {
  "choice-first-option":
    "A choice is inserted as a placeholder holding its first option; CodeMirror offers no list of the other options.",
  "tab-stop-transform":
    "A tab stop's own transform is not applied: its occurrence mirrors the stop's text untransformed, where VS Code transforms the mirror when the cursor leaves the stop.",
  "nested-placeholder":
    "A placeholder nested inside another placeholder is inserted as text inside the outer field and is not a tab stop of its own.",
  "nested-final-tab-stop":
    "A final tab stop nested inside a placeholder is flattened with it, so the final position is the end of the snippet.",
  "unsupported-variable":
    "Only TM_SELECTED_TEXT and SELECTION resolve. Any other variable inserts its default text, or without one becomes a placeholder named after the variable, which is what VS Code does for a name it does not know.",
  "no-free-stand-in":
    "A placeholder holding a brace or line break needs a character absent from the snippet and the selection to stand in for it; when the text uses every other BMP character, that placeholder's text is inserted unchanged before an empty tab stop instead of inside it.",
} as const;

export type SnippetDegradation = keyof typeof SNIPPET_DEGRADATIONS;

const SELECTION_VARIABLES = new Set(["TM_SELECTED_TEXT", "SELECTION"]);

const FIELD_UNSAFE = ["{", "}", "\n"];

const escapeText = (text: string) => text.replace(/[{}]/g, "\\$&");

const normalizeLineBreaks = (text: string) => text.replace(/\r\n?/g, "\n");

const TEMPLATE_SYNTAX = new Set(["$", "#", "\\", "{", "}", "\n", "\r"]);

const standInCandidates = function* () {
  for (let code = 0xe000; code <= 0xf8ff; code++) yield code;
  for (let code = 1; code <= 0xffff; code++) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    if (code >= 0xe000 && code <= 0xf8ff) continue;
    yield code;
  }
};

const unusedCharacters = (text: string, count: number): string[] => {
  const used = new Set(text);
  const found: string[] = [];
  for (const code of standInCandidates()) {
    if (found.length === count) break;
    const c = String.fromCharCode(code);
    if (!used.has(c) && !TEMPLATE_SYNTAX.has(c)) found.push(c);
  }
  return found;
};

const fieldOrder = (markers: readonly Marker[]): Map<number, number> => {
  const indexes = new Set<number>();
  const visit = (children: readonly Marker[]) => {
    for (const marker of children) {
      if (marker instanceof Placeholder) indexes.add(marker.index);
      else if (!(marker instanceof Text || marker instanceof Choice)) {
        visit(marker.children);
      }
    }
  };
  visit(markers);
  const order = new Map<number, number>([[0, 0]]);
  [...indexes]
    .filter((index) => index !== 0)
    .sort((a, b) => a - b)
    .forEach((index, i) => order.set(index, i + 1));
  return order;
};

const placeholdersForUnsupportedVariables = (snippet: TextmateSnippet) => {
  const indexByName = new Map<string, number>();
  let maxIndex = Math.max(0, ...snippet.placeholders.map((p) => p.index));
  const stack: Marker[] = [...snippet.children];
  while (stack.length > 0) {
    const marker = stack.shift()!;
    if (
      marker instanceof Variable &&
      marker.children.length === 0 &&
      !SELECTION_VARIABLES.has(marker.name)
    ) {
      const index = indexByName.get(marker.name) ?? ++maxIndex;
      indexByName.set(marker.name, index);
      snippet.replace(marker, [
        new Placeholder(index).appendChild(new Text(marker.name)),
      ]);
    } else {
      stack.push(...marker.children);
    }
  }
};

class TemplateRenderer {
  readonly fields = new Set<number>();

  constructor(
    private readonly standInFor: ReadonlyMap<string, string>,
    private readonly order: ReadonlyMap<number, number>,
  ) {}

  render(markers: readonly Marker[]): string {
    let template = "";
    for (const marker of markers) {
      if (marker instanceof Placeholder) {
        const index = this.order.get(marker.index)!;
        this.fields.add(index);
        const chars = [...marker.toString()];
        if (
          chars.some((c) => FIELD_UNSAFE.includes(c) && !this.standInFor.has(c))
        ) {
          template += `${escapeText(chars.join(""))}\${${index}}`;
          continue;
        }
        const text = chars.map((c) => this.standInFor.get(c) ?? c).join("");
        template += text ? `\${${index}:${text}}` : `\${${index}}`;
      } else if (marker instanceof Text || marker instanceof Choice) {
        template += escapeText(marker.toString());
      } else {
        template += this.render(marker.children);
      }
    }
    return template;
  }
}

export const convertSnippetToTemplate = (
  body: string | readonly string[],
  variables: SnippetVariables = {},
): SnippetTemplate => {
  const source = normalizeLineBreaks(
    typeof body === "string" ? body : body.join("\n"),
  );
  const values = new Map(
    Object.entries(variables).map(([name, value]) => [
      name,
      normalizeLineBreaks(value),
    ]),
  );
  const snippet = new SnippetParser().parse(source, true);
  placeholdersForUnsupportedVariables(snippet);
  snippet.resolveVariables({
    resolve: (variable) =>
      SELECTION_VARIABLES.has(variable.name)
        ? values.get(variable.name) || undefined
        : undefined,
  });
  const standIns = unusedCharacters(
    source + [...values.values()].join(""),
    FIELD_UNSAFE.length,
  );
  const renderer = new TemplateRenderer(
    new Map(
      standIns.length === FIELD_UNSAFE.length
        ? FIELD_UNSAFE.map((c, i) => [c, standIns[i]!])
        : [],
    ),
    fieldOrder(snippet.children),
  );
  const template = renderer.render(snippet.children);
  return {
    template: renderer.fields.has(0) ? template : `${template}\${0}`,
    standIns: new Map(
      standIns.length === FIELD_UNSAFE.length
        ? standIns.map((s, i) => [s, FIELD_UNSAFE[i]!])
        : [],
    ),
  };
};
