export type SnippetVariables = Readonly<Record<string, string>>;

const escapeTemplateText = (text: string) => text.replace(/[{}]/g, "\\$&");

const isDigit = (c: string | undefined) =>
  c !== undefined && c >= "0" && c <= "9";

const isVariableStart = (c: string | undefined) =>
  c !== undefined && /[A-Za-z_]/.test(c);

const isVariableChar = (c: string | undefined) =>
  c !== undefined && /[A-Za-z0-9_]/.test(c);

class SnippetReader {
  private index = 0;

  constructor(
    private readonly body: string,
    private readonly variables: SnippetVariables,
  ) {}

  read(): string {
    return this.readUntil(null).template;
  }

  private peek(offset = 0) {
    return this.body[this.index + offset];
  }

  private readUntil(
    stop: string | null,
    escapable = "$}\\",
  ): { template: string; text: string } {
    let template = "";
    let text = "";
    while (this.index < this.body.length) {
      const c = this.body[this.index]!;
      if (stop !== null && c === stop) {
        return { template, text };
      }
      if (c === "\\" && escapable.includes(this.peek(1) ?? "")) {
        const literal = this.peek(1)!;
        template += escapeTemplateText(literal);
        text += literal;
        this.index += 2;
        continue;
      }
      if (c === "$") {
        const element = this.readElement();
        if (element) {
          template += element.template;
          text += element.text;
          continue;
        }
      }
      template += escapeTemplateText(c);
      text += c;
      this.index += 1;
    }
    return { template, text };
  }

  private readInt(): string {
    const start = this.index;
    while (isDigit(this.peek())) this.index += 1;
    return this.body.slice(start, this.index);
  }

  private readName(): string {
    const start = this.index;
    while (isVariableChar(this.peek())) this.index += 1;
    return this.body.slice(start, this.index);
  }

  private resolveVariable(name: string, fallback: string): string {
    const value = this.variables[name];
    if (value !== undefined && value !== "") return value;
    return name in this.variables ? fallback : fallback || name;
  }

  private tabStop(stop: string, placeholder: string) {
    if (!placeholder) {
      return { template: `\${${stop}}`, text: "" };
    }
    if (/[{}]/.test(placeholder)) {
      return {
        template: `${escapeTemplateText(placeholder)}\${${stop}}`,
        text: placeholder,
      };
    }
    return { template: `\${${stop}:${placeholder}}`, text: placeholder };
  }

  private readElement(): { template: string; text: string } | null {
    const start = this.index;
    this.index += 1;
    if (isDigit(this.peek())) {
      return this.tabStop(this.readInt(), "");
    }
    if (isVariableStart(this.peek())) {
      const name = this.readName();
      const value = this.resolveVariable(name, "");
      return { template: escapeTemplateText(value), text: value };
    }
    if (this.peek() !== "{") {
      this.index = start;
      return null;
    }
    this.index += 1;
    if (isDigit(this.peek())) {
      const stop = this.readInt();
      if (this.peek() === "}") {
        this.index += 1;
        return this.tabStop(stop, "");
      }
      if (this.peek() === ":") {
        this.index += 1;
        const { text } = this.readUntil("}");
        this.index += 1;
        return this.tabStop(stop, text);
      }
      if (this.peek() === "|") {
        this.index += 1;
        const { text } = this.readUntil("|", "$}\\,|");
        const choices = text;
        this.index += 2;
        return this.tabStop(stop, choices.split(",")[0] ?? "");
      }
    } else if (isVariableStart(this.peek())) {
      const name = this.readName();
      if (this.peek() === "}") {
        this.index += 1;
        const value = this.resolveVariable(name, "");
        return { template: escapeTemplateText(value), text: value };
      }
      if (this.peek() === ":") {
        this.index += 1;
        const { text } = this.readUntil("}");
        this.index += 1;
        const value = this.resolveVariable(name, text);
        return { template: escapeTemplateText(value), text: value };
      }
      if (this.peek() === "/") {
        let depth = 0;
        while (this.index < this.body.length) {
          const c = this.body[this.index]!;
          if (c === "\\") {
            this.index += 2;
            continue;
          }
          this.index += 1;
          if (c === "{") depth += 1;
          if (c === "}") {
            if (depth === 0) break;
            depth -= 1;
          }
        }
        const value = this.resolveVariable(name, "");
        return { template: escapeTemplateText(value), text: value };
      }
    }
    this.index = start;
    return null;
  }
}

export const convertSnippetToTemplate = (
  body: string | readonly string[],
  variables: SnippetVariables = {},
): string =>
  new SnippetReader(
    typeof body === "string" ? body : body.join("\n"),
    variables,
  ).read();
