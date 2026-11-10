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
} as const;

export type SnippetDegradation = keyof typeof SNIPPET_DEGRADATIONS;

const SELECTION_VARIABLES = new Set(["TM_SELECTED_TEXT", "SELECTION"]);

const FIELD_UNSAFE = ["{", "}", "\n"];

const normalizeLineBreaks = (text: string) => text.replace(/\r\n?/g, "\n");

const unusedCharacters = (text: string, count: number): string[] => {
  const found: string[] = [];
  for (let code = 0xe000; code <= 0xf8ff && found.length < count; code++) {
    const c = String.fromCharCode(code);
    if (!text.includes(c)) found.push(c);
  }
  return found;
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

  constructor(private readonly standInFor: ReadonlyMap<string, string>) {}

  render(markers: readonly Marker[]): string {
    let template = "";
    for (const marker of markers) {
      if (marker instanceof Placeholder) {
        this.fields.add(marker.index);
        const text = [...marker.toString()]
          .map((c) => this.standInFor.get(c) ?? c)
          .join("");
        template += text
          ? `\${${marker.index}:${text}}`
          : `\${${marker.index}}`;
      } else if (marker instanceof Text || marker instanceof Choice) {
        template += marker.toString().replace(/[{}]/g, "\\$&");
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
    new Map(FIELD_UNSAFE.map((c, i) => [c, standIns[i]!])),
  );
  const template = renderer.render(snippet.children);
  return {
    template: renderer.fields.has(0) ? template : `${template}\${0}`,
    standIns: new Map(standIns.map((s, i) => [s, FIELD_UNSAFE[i]!])),
  };
};
