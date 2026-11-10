export type SnippetVariables = Readonly<Record<string, string>>;

type SnippetNode =
  | { kind: "text"; value: string }
  | { kind: "stop"; index: string; children: SnippetNode[] | null }
  | { kind: "choice"; index: string; options: string[] }
  | { kind: "variable"; name: string; children: SnippetNode[] | null };

export interface SnippetTemplate {
  template: string;
  standIns: ReadonlyMap<string, string>;
}

const FIELD_UNSAFE = ["{", "}", "\n"];

const isDigit = (c: string | undefined) =>
  c !== undefined && c >= "0" && c <= "9";

const isVariableStart = (c: string | undefined) =>
  c !== undefined && /[A-Za-z_]/.test(c);

const isVariableChar = (c: string | undefined) =>
  c !== undefined && /[A-Za-z0-9_]/.test(c);

class SnippetParser {
  private index = 0;

  constructor(private readonly body: string) {}

  parse(): SnippetNode[] {
    return this.readNodes(null);
  }

  private peek(offset = 0) {
    return this.body[this.index + offset];
  }

  private readNodes(stop: string | null): SnippetNode[] {
    const nodes: SnippetNode[] = [];
    let text = "";
    const flush = () => {
      if (text) nodes.push({ kind: "text", value: text });
      text = "";
    };
    while (this.index < this.body.length) {
      const c = this.body[this.index]!;
      if (stop !== null && c === stop) break;
      if (c === "\\" && "$}\\".includes(this.peek(1) ?? "")) {
        text += this.peek(1);
        this.index += 2;
        continue;
      }
      if (c === "$") {
        const node = this.readElement();
        if (node) {
          flush();
          nodes.push(node);
          continue;
        }
      }
      text += c;
      this.index += 1;
    }
    flush();
    return nodes;
  }

  private readWhile(test: (c: string | undefined) => boolean): string {
    const start = this.index;
    while (test(this.peek())) this.index += 1;
    return this.body.slice(start, this.index);
  }

  private readChoices(): string[] | null {
    const options: string[] = [];
    let option = "";
    while (this.index < this.body.length) {
      const c = this.body[this.index]!;
      if (c === "\\" && "$}\\,|".includes(this.peek(1) ?? "")) {
        option += this.peek(1);
        this.index += 2;
        continue;
      }
      if (c === ",") {
        options.push(option);
        option = "";
        this.index += 1;
        continue;
      }
      if (c === "|" && this.peek(1) === "}") {
        options.push(option);
        this.index += 2;
        return options;
      }
      option += c;
      this.index += 1;
    }
    return null;
  }

  private skipTransform(): boolean {
    let slashes = 0;
    while (this.index < this.body.length) {
      const c = this.body[this.index]!;
      if (c === "\\") {
        this.index += 2;
        continue;
      }
      this.index += 1;
      if (c === "/") slashes += 1;
      if (slashes === 3) {
        this.readWhile((ch) => ch !== undefined && ch !== "}");
        if (this.peek() !== "}") return false;
        this.index += 1;
        return true;
      }
    }
    return false;
  }

  private readElement(): SnippetNode | null {
    const start = this.index;
    const fail = () => {
      this.index = start;
      return null;
    };
    this.index += 1;
    if (isDigit(this.peek())) {
      return {
        kind: "stop",
        index: String(Number(this.readWhile(isDigit))),
        children: null,
      };
    }
    if (isVariableStart(this.peek())) {
      return {
        kind: "variable",
        name: this.readWhile(isVariableChar),
        children: null,
      };
    }
    if (this.peek() !== "{") return fail();
    this.index += 1;
    if (isDigit(this.peek())) {
      const index = String(Number(this.readWhile(isDigit)));
      if (this.peek() === "}") {
        this.index += 1;
        return { kind: "stop", index, children: null };
      }
      if (this.peek() === ":") {
        this.index += 1;
        const children = this.readNodes("}");
        if (this.peek() !== "}") return fail();
        this.index += 1;
        return { kind: "stop", index, children };
      }
      if (this.peek() === "|") {
        this.index += 1;
        const options = this.readChoices();
        return options ? { kind: "choice", index, options } : fail();
      }
      return fail();
    }
    if (isVariableStart(this.peek())) {
      const name = this.readWhile(isVariableChar);
      if (this.peek() === "}") {
        this.index += 1;
        return { kind: "variable", name, children: null };
      }
      if (this.peek() === ":") {
        this.index += 1;
        const children = this.readNodes("}");
        if (this.peek() !== "}") return fail();
        this.index += 1;
        return { kind: "variable", name, children };
      }
      if (this.peek() === "/") {
        this.index += 1;
        return this.skipTransform()
          ? { kind: "variable", name, children: null }
          : fail();
      }
    }
    return fail();
  }
}

class SnippetRenderer {
  private readonly defaults = new Map<string, SnippetNode[]>();

  readonly stops = new Set<string>();

  constructor(
    private readonly variables: SnippetVariables,
    private readonly standInFor: ReadonlyMap<string, string>,
  ) {}

  collectDefaults(nodes: readonly SnippetNode[]) {
    for (const node of nodes) {
      if (node.kind === "stop" || node.kind === "choice") {
        this.stops.add(node.index);
      }
      if (node.kind === "stop" && node.children) {
        if (!this.defaults.has(node.index) && node.children.length > 0) {
          this.defaults.set(node.index, node.children);
        }
        this.collectDefaults(node.children);
      } else if (node.kind === "choice") {
        if (!this.defaults.has(node.index)) {
          this.defaults.set(node.index, [
            { kind: "text", value: node.options[0] ?? "" },
          ]);
        }
      } else if (node.kind === "variable" && node.children) {
        this.collectDefaults(node.children);
      }
    }
  }

  private variableText(
    name: string,
    children: readonly SnippetNode[] | null,
    seen: ReadonlySet<string>,
  ): string {
    const value = this.variables[name];
    if (value) return value;
    if (children) return this.text(children, seen);
    return name in this.variables ? "" : name;
  }

  text(nodes: readonly SnippetNode[], seen: ReadonlySet<string>): string {
    let text = "";
    for (const node of nodes) {
      if (node.kind === "text") {
        text += node.value;
      } else if (node.kind === "variable") {
        text += this.variableText(node.name, node.children, seen);
      } else {
        text += this.placeholder(node.index, seen);
      }
    }
    return text;
  }

  private placeholder(index: string, seen: ReadonlySet<string>): string {
    const children = this.defaults.get(index);
    if (!children || seen.has(index)) return "";
    return this.text(children, new Set([...seen, index]));
  }

  template(nodes: readonly SnippetNode[]): string {
    let template = "";
    for (const node of nodes) {
      if (node.kind === "text") {
        template += node.value.replace(/[{}]/g, "\\$&");
      } else if (node.kind === "variable") {
        template += this.variableText(
          node.name,
          node.children,
          new Set(),
        ).replace(/[{}]/g, "\\$&");
      } else {
        const placeholder = [...this.placeholder(node.index, new Set())]
          .map((c) => this.standInFor.get(c) ?? c)
          .join("");
        template += placeholder
          ? `\${${node.index}:${placeholder}}`
          : `\${${node.index}}`;
      }
    }
    return template;
  }
}

const unusedCharacters = (text: string, count: number): string[] => {
  const found: string[] = [];
  for (let code = 0xe000; code <= 0xf8ff && found.length < count; code++) {
    const c = String.fromCharCode(code);
    if (!text.includes(c)) found.push(c);
  }
  return found;
};

export const convertSnippetToTemplate = (
  body: string | readonly string[],
  variables: SnippetVariables = {},
): SnippetTemplate => {
  const source = typeof body === "string" ? body : body.join("\n");
  const standIns = unusedCharacters(
    source + Object.values(variables).join(""),
    FIELD_UNSAFE.length,
  );
  const standInFor = new Map(FIELD_UNSAFE.map((c, i) => [c, standIns[i]!]));
  const nodes = new SnippetParser(source).parse();
  const renderer = new SnippetRenderer(variables, standInFor);
  renderer.collectDefaults(nodes);
  const template = renderer.template(nodes);
  return {
    template: renderer.stops.has("0") ? template : `${template}\${0}`,
    standIns: new Map(standIns.map((s, i) => [s, FIELD_UNSAFE[i]!])),
  };
};
