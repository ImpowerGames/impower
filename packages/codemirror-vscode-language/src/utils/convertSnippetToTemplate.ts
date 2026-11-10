export type SnippetVariables = Readonly<Record<string, string>>;

type FormatPart =
  | { kind: "text"; value: string }
  | {
      kind: "group";
      group: number;
      modifier?: string;
      ifValue?: string;
      elseValue?: string;
    };

interface Transform {
  regex: string;
  format: FormatPart[];
  options: string;
}

type SnippetNode =
  | { kind: "text"; value: string }
  | { kind: "stop"; index: string; children: SnippetNode[] | null }
  | { kind: "choice"; index: string; options: string[] }
  | {
      kind: "variable";
      name: string;
      children: SnippetNode[] | null;
      transform?: Transform;
    };

export interface SnippetTemplate {
  template: string;
  standIns: ReadonlyMap<string, string>;
}

const FIELD_UNSAFE = ["{", "}", "\n"];

const normalizeLineBreaks = (text: string) => text.replace(/\r\n?/g, "\n");

const isDigit = (c: string | undefined) =>
  c !== undefined && c >= "0" && c <= "9";

const isVariableStart = (c: string | undefined) =>
  c !== undefined && /[A-Za-z_]/.test(c);

const isVariableChar = (c: string | undefined) =>
  c !== undefined && /[A-Za-z0-9_]/.test(c);

class Scanner {
  index = 0;

  constructor(readonly source: string) {}

  get done() {
    return this.index >= this.source.length;
  }

  peek(offset = 0) {
    return this.source[this.index + offset];
  }

  escaped(escapable: string): string | null {
    const next = this.peek(1);
    if (this.peek() !== "\\" || next === undefined) return null;
    return escapable.includes(next) ? next : null;
  }

  readWhile(test: (c: string | undefined) => boolean): string {
    const start = this.index;
    while (test(this.peek())) this.index += 1;
    return this.source.slice(start, this.index);
  }

  readUntil(end: string, escapable: string): string | null {
    let text = "";
    while (!this.done) {
      const literal = this.escaped(escapable);
      if (literal !== null) {
        text += literal;
        this.index += 2;
        continue;
      }
      const c = this.peek()!;
      this.index += 1;
      if (c === end) return text;
      text += c;
    }
    return null;
  }
}

const parseFormat = (source: string): FormatPart[] => {
  const scanner = new Scanner(source);
  const parts: FormatPart[] = [];
  let text = "";
  const flush = () => {
    if (text) parts.push({ kind: "text", value: text });
    text = "";
  };
  while (!scanner.done) {
    const literal = scanner.escaped("$\\/}");
    if (literal !== null) {
      text += literal;
      scanner.index += 2;
      continue;
    }
    const start = scanner.index;
    if (scanner.peek() === "$") {
      scanner.index += 1;
      if (isDigit(scanner.peek())) {
        flush();
        parts.push({
          kind: "group",
          group: Number(scanner.readWhile(isDigit)),
        });
        continue;
      }
      if (scanner.peek() === "{" && isDigit(scanner.peek(1))) {
        scanner.index += 1;
        const group = Number(scanner.readWhile(isDigit));
        const next = scanner.peek();
        let part: FormatPart | null = null;
        if (next === "}") {
          scanner.index += 1;
          part = { kind: "group", group };
        } else if (next === ":") {
          scanner.index += 1;
          const mode = scanner.peek();
          if (mode === "/") {
            scanner.index += 1;
            const modifier = scanner.readUntil("}", "}");
            if (modifier !== null) part = { kind: "group", group, modifier };
          } else if (mode === "+") {
            scanner.index += 1;
            const ifValue = scanner.readUntil("}", "}");
            if (ifValue !== null) part = { kind: "group", group, ifValue };
          } else if (mode === "?") {
            scanner.index += 1;
            const ifValue = scanner.readUntil(":", ":");
            const elseValue =
              ifValue === null ? null : scanner.readUntil("}", "}");
            if (ifValue !== null && elseValue !== null) {
              part = { kind: "group", group, ifValue, elseValue };
            }
          } else {
            if (mode === "-") scanner.index += 1;
            const elseValue = scanner.readUntil("}", "}");
            if (elseValue !== null) part = { kind: "group", group, elseValue };
          }
        }
        if (part) {
          flush();
          parts.push(part);
          continue;
        }
      }
      scanner.index = start;
    }
    text += scanner.peek();
    scanner.index += 1;
  }
  flush();
  return parts;
};

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const uncapitalize = (value: string) =>
  value.charAt(0).toLowerCase() + value.slice(1);

const joinWords = (
  value: string,
  wordCase: (word: string, index: number) => string,
) =>
  value
    .match(/[a-z0-9]+/gi)
    ?.map(wordCase)
    .join("") ?? value;

const MODIFIERS: Readonly<Record<string, (value: string) => string>> = {
  upcase: (value) => value.toUpperCase(),
  downcase: (value) => value.toLowerCase(),
  capitalize,
  pascalcase: (value) => joinWords(value, capitalize),
  camelcase: (value) =>
    joinWords(value, (word, index) =>
      index === 0 ? uncapitalize(word) : capitalize(word),
    ),
};

const resolveFormat = (
  parts: readonly FormatPart[],
  groups: readonly (string | undefined)[],
) =>
  parts
    .map((part) => {
      if (part.kind === "text") return part.value;
      const value = groups[part.group] ?? "";
      if (part.modifier !== undefined) {
        return (MODIFIERS[part.modifier] ?? ((v: string) => v))(value);
      }
      if (part.ifValue !== undefined) {
        return value ? part.ifValue : (part.elseValue ?? "");
      }
      if (part.elseValue !== undefined) return value || part.elseValue;
      return value;
    })
    .join("");

const applyTransform = (value: string, transform: Transform): string => {
  let regex: RegExp;
  try {
    regex = new RegExp(
      transform.regex,
      transform.options.replace(/[^gimsuy]/g, ""),
    );
  } catch {
    return value;
  }
  let matched = false;
  const replaced = value.replace(regex, (...args: unknown[]) => {
    matched = true;
    const end = args.findIndex((arg) => typeof arg === "number");
    return resolveFormat(
      transform.format,
      args.slice(0, end) as (string | undefined)[],
    );
  });
  const hasElse = transform.format.some(
    (part) => part.kind === "group" && Boolean(part.elseValue),
  );
  return !matched && hasElse ? resolveFormat(transform.format, []) : replaced;
};

class SnippetParser extends Scanner {
  parse(): SnippetNode[] {
    return this.readNodes(null);
  }

  private readNodes(stop: string | null): SnippetNode[] {
    const nodes: SnippetNode[] = [];
    let text = "";
    const flush = () => {
      if (text) nodes.push({ kind: "text", value: text });
      text = "";
    };
    while (!this.done) {
      const c = this.peek()!;
      if (stop !== null && c === stop) break;
      const literal = this.escaped("$}\\");
      if (literal !== null) {
        text += literal;
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

  private readChoices(): string[] | null {
    const options: string[] = [];
    let option = "";
    while (!this.done) {
      const literal = this.escaped("$}\\,|");
      if (literal !== null) {
        option += literal;
        this.index += 2;
        continue;
      }
      const c = this.peek()!;
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

  private readRegex(): string | null {
    let regex = "";
    while (!this.done) {
      if (this.escaped("/") !== null) {
        regex += "/";
        this.index += 2;
        continue;
      }
      const c = this.peek()!;
      if (c === "\\" && this.peek(1) !== undefined) {
        regex += c + this.peek(1);
        this.index += 2;
        continue;
      }
      this.index += 1;
      if (c === "/") return regex;
      regex += c;
    }
    return null;
  }

  private readRawFormat(): string | null {
    let format = "";
    let depth = 0;
    while (!this.done) {
      const c = this.peek()!;
      if (c === "\\" && this.peek(1) !== undefined) {
        format += c + this.peek(1);
        this.index += 2;
        continue;
      }
      if (c === "$" && this.peek(1) === "{") {
        depth += 1;
        format += "${";
        this.index += 2;
        continue;
      }
      this.index += 1;
      if (c === "}" && depth > 0) depth -= 1;
      else if (c === "/" && depth === 0) return format;
      format += c;
    }
    return null;
  }

  private readTransform(): Transform | null {
    const regex = this.readRegex();
    if (regex === null) return null;
    const format = this.readRawFormat();
    if (format === null) return null;
    const options = this.readWhile((c) => c !== undefined && c !== "}");
    if (this.peek() !== "}") return null;
    this.index += 1;
    return { regex, format: parseFormat(format), options };
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
      if (this.peek() === "/") {
        this.index += 1;
        return this.readTransform()
          ? { kind: "stop", index, children: null }
          : fail();
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
        const transform = this.readTransform();
        return transform
          ? { kind: "variable", name, children: null, transform }
          : fail();
      }
    }
    return fail();
  }
}

class SnippetRenderer {
  private readonly defaults = new Map<string, SnippetNode[]>();

  readonly fields = new Set<string>();

  constructor(
    private readonly variables: SnippetVariables,
    private readonly standInFor: ReadonlyMap<string, string>,
  ) {}

  collectDefaults(nodes: readonly SnippetNode[]) {
    for (const node of nodes) {
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
    node: Extract<SnippetNode, { kind: "variable" }>,
    seen: ReadonlySet<string>,
  ): string {
    const value = this.variables[node.name];
    if (node.transform) {
      return applyTransform(value ?? "", node.transform);
    }
    if (value) return value;
    if (node.children) return this.text(node.children, seen);
    return node.name in this.variables ? "" : node.name;
  }

  text(nodes: readonly SnippetNode[], seen: ReadonlySet<string>): string {
    let text = "";
    for (const node of nodes) {
      if (node.kind === "text") {
        text += node.value;
      } else if (node.kind === "variable") {
        text += this.variableText(node, seen);
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
        template += this.variableText(node, new Set()).replace(/[{}]/g, "\\$&");
      } else {
        this.fields.add(node.index);
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
  const source = normalizeLineBreaks(
    typeof body === "string" ? body : body.join("\n"),
  );
  const values: SnippetVariables = Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      name,
      normalizeLineBreaks(value),
    ]),
  );
  const standIns = unusedCharacters(
    source + Object.values(values).join(""),
    FIELD_UNSAFE.length,
  );
  const standInFor = new Map(FIELD_UNSAFE.map((c, i) => [c, standIns[i]!]));
  const nodes = new SnippetParser(source).parse();
  const renderer = new SnippetRenderer(values, standInFor);
  renderer.collectDefaults(nodes);
  const template = renderer.template(nodes);
  return {
    template: renderer.fields.has("0") ? template : `${template}\${0}`,
    standIns: new Map(standIns.map((s, i) => [s, FIELD_UNSAFE[i]!])),
  };
};
