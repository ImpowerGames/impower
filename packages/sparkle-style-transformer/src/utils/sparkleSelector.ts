export const COLOR_SCHEME_ATTRIBUTE = "data-color-scheme";

const COLOR_SCHEME_STATE = "theme";

const table = (entries: Record<string, string>): ReadonlyMap<string, string> => new Map(Object.entries(entries));

const SELECTOR_STATE_ALIASES: ReadonlyMap<string, string> = table({
  hovered: ":hover",
  focused: ":focus",
  pressed: ":active",
  disabled: ":disabled",
  enabled: ":enabled",
  checked: ":checked",
  unchecked: ":not(:checked)",
  required: ":required",
  indeterminate: ":indeterminate",
  type_color: '[type="color"]',
  type_date: '[type="date"]',
  type_time: '[type="time"]',
  type_submit: '[type="submit"]',
  type_reset: '[type="reset"]',
  type_button: '[type="button"]',
  valid: ":valid",
  invalid: ":invalid",
  readonly: ":read-only",
  first: ":first-child",
  last: ":last-child",
  only: ":only-child",
  odd: ":nth-child(odd)",
  even: ":nth-child(even)",
  blank: ":placeholder-shown",
  before: "::before",
  after: "::after",
  placeholder: "::placeholder",
  selection: "::selection",
  marker: "::marker",
  backdrop: "::backdrop",
  opened: "[open]",
  track: "::-webkit-slider-runnable-track",
  thumb: "::-webkit-slider-thumb",
  bar: "::-webkit-progress-bar",
  fill: "::-webkit-progress-value",
  file_button: "::file-selector-button",
  "file-button": "::file-selector-button",
  picker: "::-webkit-calendar-picker-indicator",
  swatch: "::-webkit-color-swatch",
  swatch_wrapper: "::-webkit-color-swatch-wrapper",
  "swatch-wrapper": "::-webkit-color-swatch-wrapper",
  busy: '[aria-busy="true"]',
});

const ARGUMENT_STATE_ALIASES: ReadonlyMap<string, string> = table({
  direction: "dir",
  language: "lang",
});

const AT_RULE_STATES: ReadonlyMap<string, string> = table({
  container: "@container",
  layer: "@layer",
  media: "@media",
  scope: "@scope",
  supports: "@supports",
  "starting-style": "@starting-style",
  starting_style: "@starting-style",
  initial: "@starting-style",
});

const SIZE_STATES: ReadonlyMap<string, string> = table({
  "container-size": "@container(max-width:",
  container_size: "@container(max-width:",
  "screen-size": "@container screen (max-width:",
  screen_size: "@container screen (max-width:",
});

const SELECTOR_LIST_PSEUDO_CLASSES = ["has", "not", "is", "where", "host", "host-context"];

const NTH_OF_PSEUDO_CLASSES = ["nth-child", "nth-last-child"];

const VALUE_PSEUDO_CLASSES = ["nth-of-type", "nth-last-of-type", "dir", "lang", "state"];

const PLAIN_PSEUDO_CLASSES = [
  "active",
  "any-link",
  "autofill",
  "checked",
  "default",
  "defined",
  "disabled",
  "empty",
  "enabled",
  "first-child",
  "first-of-type",
  "focus",
  "focus-visible",
  "focus-within",
  "fullscreen",
  "hover",
  "in-range",
  "indeterminate",
  "invalid",
  "last-child",
  "last-of-type",
  "link",
  "modal",
  "only-child",
  "only-of-type",
  "open",
  "optional",
  "out-of-range",
  "picture-in-picture",
  "placeholder-shown",
  "popover-open",
  "read-only",
  "read-write",
  "required",
  "root",
  "target",
  "user-invalid",
  "user-valid",
  "valid",
  "visited",
];

const STANDARD_PSEUDO_CLASSES: ReadonlySet<string> = new Set([
  ...PLAIN_PSEUDO_CLASSES,
  ...SELECTOR_LIST_PSEUDO_CLASSES,
  ...NTH_OF_PSEUDO_CLASSES,
  ...VALUE_PSEUDO_CLASSES,
]);

export const WRITTEN_SELECTOR_STATES: ReadonlySet<string> = new Set([
  COLOR_SCHEME_STATE,
  ...SELECTOR_STATE_ALIASES.keys(),
  ...ARGUMENT_STATE_ALIASES.keys(),
  ...AT_RULE_STATES.keys(),
  ...SIZE_STATES.keys(),
  ...STANDARD_PSEUDO_CLASSES,
]);

export interface SparkleSelectorOptions {
  breakpoints: Record<string, number>;
  colorScheme: "attribute" | "media";
  attributeName?: (name: string) => string;
}

type ArgumentKind = "selectors" | "nth" | "value";

const ARGUMENT_KINDS: ReadonlyMap<string, ArgumentKind> = new Map<string, ArgumentKind>([
  ...SELECTOR_LIST_PSEUDO_CLASSES.map((name) => [name, "selectors"] as const),
  ...NTH_OF_PSEUDO_CLASSES.map((name) => [name, "nth"] as const),
  ...VALUE_PSEUDO_CLASSES.map((name) => [name, "value"] as const),
]);

const OPTIONAL_ARGUMENT_PSEUDO_CLASSES: ReadonlySet<string> = new Set(["host"]);

export type SelectorStateArguments = "required" | "optional" | "none";

export const selectorStateArguments = (name: string): SelectorStateArguments | undefined => {
  if (name === COLOR_SCHEME_STATE || SIZE_STATES.has(name) || ARGUMENT_STATE_ALIASES.has(name)) {
    return "required";
  }
  if (AT_RULE_STATES.has(name) || OPTIONAL_ARGUMENT_PSEUDO_CLASSES.has(name)) {
    return "optional";
  }
  if (SELECTOR_STATE_ALIASES.has(name)) {
    return "none";
  }
  if (STANDARD_PSEUDO_CLASSES.has(name)) {
    return ARGUMENT_KINDS.has(name) ? "required" : "none";
  }
  return undefined;
};

const WHITESPACE = /[ \t\r\n\f]+/y;
const WORD = /[\p{L}\p{N}_-]+(?:@[\p{L}\p{N}_][\p{L}\p{N}_-]*)*/uy;
const NAME_START = /^[_\p{L}]/u;
const STATE = /@([_\p{L}][\p{L}\p{N}_-]*(?:@[\p{L}\p{N}_][\p{L}\p{N}_-]*)*)/uy;
const PSEUDO = /::?[\p{L}\p{N}_-]*/uy;
const QUOTED = /"(?:\\[^]|[^"\\])*"?|'(?:\\[^]|[^'\\])*'?/y;
const ATTRIBUTE =
  /#([_\p{L}][_\p{L}0-9-]*)?(?:([~|^$*]?=)("(?:\\[^]|[^"\\])*"?|'(?:\\[^]|[^'\\])*'?|(?:\\[0-9a-fA-F]{1,6}(?:\r\n|[ \t\r\n\f])?|\\[^]|[^\s"'`<>=:(){}[\],\\])*))?/uy;
const NTH_OF = /[ \t\r\n\f]+of(?=[ \t\r\n\f])/y;
const CLOSE_AHEAD = /[ \t\r\n\f]*[)]/y;
const SELECTOR_FUNCTION_BEFORE = /(?:^|[^\p{L}\p{N}_-])selector$/u;
const ESCAPE_OR_AT = /\\[^]|@/g;
const PRELUDE_GLUE_BEFORE = new Set(["(", ":", ",", "<", ">", "="]);
const PRELUDE_GLUE_AFTER = new Set([")", ":", ",", "<", ">", "="]);

const escapeAts = (text: string) => text.replace(ESCAPE_OR_AT, (match) => (match === "@" ? "\\@" : match));

class SparkleSelectorWriter {
  private i = 0;

  constructor(
    private readonly src: string,
    private readonly options: SparkleSelectorOptions,
  ) {}

  write(): string {
    let out = "";
    while (this.i < this.src.length) {
      out += this.list("selectors", true);
      if (this.i < this.src.length) {
        out += this.src[this.i++];
      }
    }
    return out.trim();
  }

  private match(pattern: RegExp): RegExpExecArray | null {
    pattern.lastIndex = this.i;
    const match = pattern.exec(this.src);
    if (match) {
      this.i = pattern.lastIndex;
    }
    return match;
  }

  private list(kind: "selectors" | "raw", topLevel: boolean): string {
    const selectors = kind === "selectors";
    let out = "";
    let classNext = selectors;
    let itemStart = true;
    while (this.i < this.src.length) {
      const char = this.src[this.i]!;
      if (char === ")") {
        break;
      }
      const whitespace = this.match(WHITESPACE);
      if (whitespace) {
        if (this.src.startsWith(">>", this.i)) {
          continue;
        }
        if (selectors) {
          classNext = true;
        } else {
          out += whitespace[0];
        }
        continue;
      }
      if (this.src.startsWith(">>", this.i)) {
        this.i += 2;
        this.match(WHITESPACE);
        if (!selectors) {
          out = out.trimEnd() + " ";
        } else if (!itemStart) {
          out += " ";
        } else if (topLevel) {
          out += "& ";
        }
        classNext = selectors;
        itemStart = false;
        continue;
      }
      if (char === ">" || char === "+" || char === "~" || char === ",") {
        this.i++;
        out += char;
        classNext = selectors;
        itemStart = char === ",";
        continue;
      }
      itemStart = false;
      const word = this.match(WORD);
      if (word) {
        const name = word[0];
        out += (classNext && NAME_START.test(name) ? "." : "") + escapeAts(name);
        classNext = false;
        continue;
      }
      classNext = false;
      if (char === "@") {
        const state = this.match(STATE);
        if (state) {
          const written = this.state(state[1]!);
          out += written.text;
          if (written.atRule) {
            out += this.prelude(written.atRule);
          }
          continue;
        }
      }
      out += this.token(char);
    }
    return out;
  }

  private token(char: string): string {
    if (char === '"' || char === "'") {
      return this.match(QUOTED)![0];
    }
    if (char === "[") {
      return this.bracket();
    }
    if (char === "#") {
      return this.attribute();
    }
    if (char === ":") {
      const pseudo = this.match(PSEUDO)![0];
      return this.src[this.i] === "(" ? pseudo + this.raw() : pseudo;
    }
    if (char === "(") {
      return this.raw();
    }
    this.i++;
    return char;
  }

  private argument(inner: () => string): { text: string; close: string } {
    this.i++;
    const text = inner();
    if (this.src[this.i] === ")") {
      this.i++;
      return { text, close: ")" };
    }
    return { text, close: "" };
  }

  private enclosed(inner: () => string): string {
    const { text, close } = this.argument(inner);
    return `(${text}${close}`;
  }

  private raw(): string {
    return this.enclosed(() => this.list("raw", false));
  }

  private value(): string {
    const from = this.i;
    let depth = 0;
    while (this.i < this.src.length) {
      const char = this.src[this.i]!;
      if (char === '"' || char === "'") {
        this.match(QUOTED);
        continue;
      }
      if (char === "\\") {
        this.i += 2;
        continue;
      }
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        if (depth === 0) {
          break;
        }
        depth--;
      }
      this.i++;
    }
    return this.src.slice(from, this.i).trim();
  }

  private nth(): string {
    const from = this.i;
    while (this.i < this.src.length && this.src[this.i] !== ")") {
      NTH_OF.lastIndex = this.i;
      if (NTH_OF.test(this.src)) {
        const step = this.src.slice(from, this.i).trim();
        this.i = NTH_OF.lastIndex;
        return `${step} of ${this.list("selectors", false)}`;
      }
      this.i++;
    }
    return this.src.slice(from, this.i).trim();
  }

  private bracket(): string {
    const from = this.i;
    this.i++;
    while (this.i < this.src.length && this.src[this.i] !== "]") {
      const char = this.src[this.i]!;
      if (char === '"' || char === "'") {
        this.match(QUOTED);
      } else {
        this.i += char === "\\" ? 2 : 1;
      }
    }
    this.i = Math.min(this.i + 1, this.src.length);
    return this.src.slice(from, this.i);
  }

  private attribute(): string {
    const [, name = "", operator = "", value = ""] = this.match(ATTRIBUTE)!;
    const attribute = name ? (this.options.attributeName?.(name) ?? name) : "";
    const written = value.startsWith('"') || value.startsWith("'") ? value : escapeAts(value);
    return `[${attribute}${operator}${written}]`;
  }

  private breakpoint(value: string): string {
    const { breakpoints } = this.options;
    return Object.prototype.hasOwnProperty.call(breakpoints, value) ? `${breakpoints[value]}px` : value;
  }

  private state(name: string): { text: string; atRule?: string } {
    const called = this.src[this.i] === "(";
    if (name === COLOR_SCHEME_STATE && called) {
      const { text, close } = this.argument(() => this.value());
      return this.options.colorScheme === "media"
        ? { text: `@media(prefers-color-scheme:${text}${close}`, atRule: "@media" }
        : { text: `@${COLOR_SCHEME_STATE}(${text}${close}` };
    }
    const size = SIZE_STATES.get(name);
    if (size && called) {
      const { text, close } = this.argument(() => this.value());
      return { text: `${size}${this.breakpoint(text)}${close}`, atRule: "@container" };
    }
    const atRule = AT_RULE_STATES.get(name);
    if (atRule) {
      return { text: atRule, atRule };
    }
    const alias = SELECTOR_STATE_ALIASES.get(name);
    if (alias) {
      return { text: called ? alias + this.raw() : alias };
    }
    const pseudo = ARGUMENT_STATE_ALIASES.get(name) ?? (STANDARD_PSEUDO_CLASSES.has(name) ? name : undefined);
    if (pseudo && called) {
      const kind = ARGUMENT_KINDS.get(pseudo);
      const args =
        kind === "selectors"
          ? this.enclosed(() => this.list("selectors", false))
          : kind === "nth"
            ? this.enclosed(() => this.nth())
            : kind === "value"
              ? this.enclosed(() => this.value())
              : this.raw();
      return { text: `:${pseudo}${args}` };
    }
    if (pseudo && STANDARD_PSEUDO_CLASSES.has(name)) {
      return { text: `:${pseudo}` };
    }
    return { text: called ? `@${name}${this.raw()}` : `@${name}` };
  }

  private prelude(atRule: string): string {
    let out = "";
    const declarations: boolean[] = [false];
    let space = false;
    let atStart = true;
    while (this.i < this.src.length) {
      const char = this.src[this.i]!;
      if (this.match(WHITESPACE)) {
        space = true;
        continue;
      }
      if (char === ")" && declarations.length === 1) {
        break;
      }
      if (space) {
        const previous = out[out.length - 1];
        const glued =
          (atStart ? char === "(" : previous != null && PRELUDE_GLUE_BEFORE.has(previous)) ||
          PRELUDE_GLUE_AFTER.has(char);
        if (!glued) {
          out += " ";
        }
        space = false;
      }
      atStart = false;
      if (char === "(") {
        const scope = declarations.length === 1 && atRule === "@scope";
        const condition =
          atRule === "@supports" && !declarations[declarations.length - 1] && SELECTOR_FUNCTION_BEFORE.test(out);
        if (scope || condition) {
          out += this.enclosed(() => this.list("selectors", false));
          continue;
        }
        declarations.push(declarations[declarations.length - 1]!);
      } else if (char === ")") {
        declarations.pop();
      } else if (char === ":") {
        declarations[declarations.length - 1] = true;
      } else if (char === "#") {
        this.i++;
        out += char;
        continue;
      }
      if (char === "@") {
        const state = this.match(STATE);
        if (state) {
          out += this.state(state[1]!).text;
          continue;
        }
      }
      if (char === "(" || char === ")" || char === ":") {
        this.i++;
        out += char;
        continue;
      }
      const word = this.match(WORD);
      if (word) {
        out += out.endsWith("width:") && this.closesNext() ? this.breakpoint(word[0]) : word[0];
        continue;
      }
      out += this.token(char);
    }
    return out;
  }

  private closesNext(): boolean {
    CLOSE_AHEAD.lastIndex = this.i;
    return CLOSE_AHEAD.test(this.src);
  }
}

const QUOTED_PART = /("(?:\\[^]|[^"\\])*"|'(?:\\[^]|[^'\\])*')/;

const COLOR_SCHEME_VARIANT = /@theme[(](light|dark)[)]/g;

const unquoted = (selector: string) =>
  selector
    .split(QUOTED_PART)
    .filter((_, i) => !(i & 1))
    .join("");

const hasNestingSelector = (selector: string) => unquoted(selector).includes("&");

const splitTopLevelCommas = (selector: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "\\") i++;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
};

const liftColorScheme = (selector: string): string => {
  if (!unquoted(selector).includes(`@${COLOR_SCHEME_STATE}(`)) {
    return selector;
  }
  return splitTopLevelCommas(selector)
    .map((part) => {
      let scheme: string | undefined;
      const rest = part
        .split(QUOTED_PART)
        .map((piece, i) =>
          i & 1
            ? piece
            : piece.replace(COLOR_SCHEME_VARIANT, (_m, s: string) => {
                scheme = s;
                return "";
              }),
        )
        .join("")
        .trim();
      if (!scheme) {
        return part.trim();
      }
      const target = !rest ? "&" : hasNestingSelector(rest) ? rest : /^[:[]/.test(rest) ? `&${rest}` : `& ${rest}`;
      return `:where([${COLOR_SCHEME_ATTRIBUTE}="${scheme}"]) ${target}`;
    })
    .join(", ");
};

export const writeSparkleSelector = (selector: string, options: SparkleSelectorOptions): string => {
  const css = new SparkleSelectorWriter(selector, options).write();
  return options.colorScheme === "attribute" ? liftColorScheme(css) : css;
};

export const anchorSelfTargeted = (selector: string): string =>
  splitTopLevelCommas(selector)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      return !hasNestingSelector(trimmed) && (trimmed.startsWith("[") || trimmed.startsWith(":")) ? "&" + trimmed : trimmed;
    })
    .filter(Boolean)
    .join(", ");
