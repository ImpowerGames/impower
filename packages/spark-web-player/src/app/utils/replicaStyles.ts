export interface ReplicaStyleScope {
  scope: string;
  replica: string;
  keyframes: string;
}

export function splitSelectors(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") {
        i++;
      } else if (c === quote) {
        quote = "";
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "(" || c === "[") {
      depth++;
    } else if (c === ")" || c === "]") {
      depth--;
    } else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

const startsWithCompound = (selector: string, compound: string) =>
  selector === compound || (selector.startsWith(compound) && /[\s>+~]/.test(selector[compound.length]!));

function replicaSelector(selector: string, options: ReplicaStyleScope): string {
  if (startsWithCompound(selector, options.replica)) {
    return selector;
  }
  if (startsWithCompound(selector, options.scope)) {
    return options.replica + selector.slice(options.scope.length);
  }
  return `${options.replica} ${selector}`;
}

const DOCUMENT_WIDE = /^@(property|font-face|counter-style|font-palette-values|font-feature-values|view-transition|page|import|namespace)\b/i;

function replicaRules(owner: CSSStyleSheet | CSSGroupingRule, options: ReplicaStyleScope, nested: boolean) {
  const rules = owner.cssRules;
  for (let index = rules.length - 1; index >= 0; index--) {
    const rule = rules[index]!;
    if (DOCUMENT_WIDE.test(rule.cssText)) {
      owner.deleteRule(index);
      continue;
    }
    const styled = rule as CSSStyleRule;
    const keyframes = rule as CSSKeyframesRule;
    if (typeof styled.selectorText === "string" && styled.style) {
      if (!nested) {
        styled.selectorText = splitSelectors(styled.selectorText)
          .map((selector) => replicaSelector(selector, options))
          .join(", ");
      }
      if (styled.cssRules) {
        replicaRules(styled as unknown as CSSGroupingRule, options, true);
      }
    } else if (typeof keyframes.findRule === "function" && typeof keyframes.name === "string") {
      if (!keyframes.name.startsWith(options.keyframes)) {
        keyframes.name = `${options.keyframes}${keyframes.name}`;
      }
    } else if ("cssRules" in rule) {
      replicaRules(rule as CSSGroupingRule, options, nested);
    }
  }
}

function parsed(text: string, doc: Document): CSSStyleSheet | undefined {
  const Sheet = (doc.defaultView as (Window & typeof globalThis) | null)?.CSSStyleSheet;
  if (!Sheet) {
    return undefined;
  }
  try {
    const sheet = new Sheet();
    sheet.replaceSync(text);
    return sheet;
  } catch {
    return undefined;
  }
}

const rewritten = new Map<string, string>();

export function replicaCss(text: string, doc: Document, options: ReplicaStyleScope): string {
  const key = `${options.replica}\n${text}`;
  const known = rewritten.get(key);
  if (known !== undefined) {
    return known;
  }
  const sheet = parsed(text, doc);
  let result: string;
  if (sheet) {
    replicaRules(sheet, options, false);
    result = Array.from(sheet.cssRules)
      .map((rule) => rule.cssText)
      .join("\n");
  } else {
    result = text.split(`${options.scope} `).join(`${options.replica} `).split("@keyframes ").join(`@keyframes ${options.keyframes}`);
  }
  if (rewritten.size >= 64) {
    rewritten.delete(rewritten.keys().next().value!);
  }
  rewritten.set(key, result);
  return result;
}

function keyframeNames(rules: CSSRuleList | undefined, options: ReplicaStyleScope, names: Set<string>) {
  for (const rule of Array.from(rules ?? [])) {
    const keyframes = rule as CSSKeyframesRule;
    if (typeof keyframes.findRule === "function" && typeof keyframes.name === "string") {
      if (keyframes.name.startsWith(options.keyframes)) {
        names.add(keyframes.name.slice(options.keyframes.length));
      }
    } else if ("cssRules" in rule) {
      keyframeNames((rule as CSSGroupingRule).cssRules, options, names);
    }
  }
}

export function replicaKeyframeNames(root: Element, options: ReplicaStyleScope): Set<string> {
  const names = new Set<string>();
  for (const style of Array.from(root.querySelectorAll("style"))) {
    keyframeNames(style.sheet?.cssRules, options, names);
  }
  return names;
}

export function bindAnimationNames(el: Element, options: ReplicaStyleScope, bound: ReadonlySet<string>) {
  const names = el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue("animation-name") ?? "";
  if (!names || bound.size === 0) {
    return;
  }
  const renamed = names
    .split(",")
    .map((name) => name.trim())
    .map((name) => (bound.has(name) ? `${options.keyframes}${name}` : name))
    .join(", ");
  if (renamed !== names) {
    (el as HTMLElement).style.setProperty("animation-name", renamed, "important");
  }
}
