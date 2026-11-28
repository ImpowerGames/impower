import type { SyntaxNode } from "@lezer/common";
import type { SparkProgram } from "../types/SparkProgram";
import type { ElementNode } from "../types/SparkleNode";
import { layoutTreeSource, takesLines, walkLayoutTree } from "./layoutTree";

type Sparkle = SparkProgram["sparkle"];

const OWN_LAYOUTS: ReadonlySet<string> = new Set(["main", "textstream"]);

export const limitsVariant = (node: ElementNode): boolean =>
  Object.hasOwn(node.props ?? {}, "variant");

export function elementVariant(node: ElementNode): string | undefined {
  const prop = limitsVariant(node) ? node.props["variant"] : undefined;
  return prop?.kind === "literal" && prop.value !== "" ? String(prop.value) : undefined;
}

const admitsLabel = (node: ElementNode, key: "variant" | "speaker", value: string | undefined) => {
  const prop = Object.hasOwn(node.props ?? {}, key) ? node.props[key] : undefined;
  if (!prop || prop.kind !== "literal" || prop.value === "") {
    return true;
  }
  return String(prop.value) === value;
};

export const admitsVariant = (node: ElementNode, variant: string | undefined): boolean =>
  admitsLabel(node, "variant", variant);

export const limitsLine = (node: ElementNode): boolean =>
  limitsVariant(node) || Object.hasOwn(node.props ?? {}, "speaker");

export const admitsLine = (
  node: ElementNode,
  line: { variant?: string; speaker?: string },
): boolean => admitsLabel(node, "variant", line.variant) && admitsLabel(node, "speaker", line.speaker);

export const elementNames = (node: ElementNode): string[] =>
  [node.tag, node.name, ...(node.classes ?? [])].filter(
    (name): name is string => typeof name === "string" && name !== "",
  );

export interface VariantLimit {
  node: ElementNode;
  variant: string;
  source: string;
}

const limitsBySparkle = new WeakMap<object, Map<string, VariantLimit[]>>();

export function layoutVariantLimits(sparkle: Sparkle | undefined, layoutName: string): VariantLimit[] {
  const layout = sparkle?.layouts?.[layoutName];
  if (!sparkle || !layout || OWN_LAYOUTS.has(layoutName)) {
    return [];
  }
  let cached = limitsBySparkle.get(sparkle);
  if (!cached) {
    cached = new Map();
    limitsBySparkle.set(sparkle, cached);
  }
  const known = cached.get(layoutName);
  if (known) {
    return known;
  }
  const found: VariantLimit[] = [];
  walkLayoutTree(sparkle, layoutName, (element) => {
    const variant = takesLines(element) ? elementVariant(element.node) : undefined;
    if (variant) {
      found.push({ node: element.node, variant, source: element.source });
    }
  });
  cached.set(layoutName, found);
  return found;
}

export const variantSource = layoutTreeSource;

const NOT_LINE_KINDS: ReadonlySet<string> = new Set([
  "character_name",
  "character_parenthetical",
  "choice",
  "choices",
  "text",
  "image",
  "stroke",
  "mask",
  "stream",
  "cast",
]);

export const variantClaimKey = (kind: string, variant: string) => `${kind}\n${variant}`;

export interface VariantClaim {
  layouts: string[];
  sources: Set<string>;
}

export function variantLayoutClaims(sparkle: Sparkle | undefined): Map<string, VariantClaim> {
  const claims = new Map<string, VariantClaim>();
  for (const layout of Object.keys(sparkle?.layouts ?? {})) {
    for (const limit of layoutVariantLimits(sparkle, layout)) {
      for (const kind of elementNames(limit.node)) {
        if (NOT_LINE_KINDS.has(kind)) {
          continue;
        }
        const key = variantClaimKey(kind, limit.variant);
        const claim = claims.get(key) ?? { layouts: [], sources: new Set<string>() };
        if (!claim.layouts.includes(layout)) {
          claim.layouts.push(layout);
        }
        claim.sources.add(limit.source);
        claims.set(key, claim);
      }
    }
  }
  return new Map([...claims].filter(([, claim]) => claim.layouts.length > 1));
}

export function variantLayoutKinds(
  sparkle: Sparkle | undefined,
  layout: string,
  variant: string,
): string[] {
  const kinds = layoutVariantLimits(sparkle, layout)
    .filter((limit) => limit.variant === variant)
    .flatMap((limit) => elementNames(limit.node))
    .filter((kind) => !NOT_LINE_KINDS.has(kind));
  return [...new Set(kinds)].filter((kind) => variantLayouts(sparkle, kind, variant)[0] === layout);
}

export interface WrittenVariantLimit {
  names: string[];
  variant: string;
  from: number;
  to: number;
}

const VARIANT_PROP = /^#variant=(["']?)([\p{L}\p{N}_]+)\1$/u;

const descendants = (node: SyntaxNode, name: string, found: SyntaxNode[] = []): SyntaxNode[] => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) {
      found.push(child);
    } else {
      descendants(child, name, found);
    }
  }
  return found;
};

export function writtenVariantLimits(
  layout: SyntaxNode,
  read: (node: { from: number; to: number }) => string,
): WrittenVariantLimit[] {
  const found: WrittenVariantLimit[] = [];
  const visit = (node: SyntaxNode): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name !== "LuauSparkleElement") {
        visit(child);
        continue;
      }
      const begin = child.getChild("LuauSparkleElement_begin");
      const tag = begin ? descendants(begin, "LuauSparkleElementName")[0] : undefined;
      const name = tag ? read(tag).trim() : "";
      if (name === "cast") {
        continue;
      }
      const parts = child.getChild("LuauSparkleElement_content")?.getChild("LuauSparkleElementParts");
      if (parts) {
        const names = [name, ...descendants(parts, "LuauSparkleClassName").map((n) => read(n).trim())].filter(Boolean);
        for (const prop of descendants(parts, "LuauSparklePropAttribute")) {
          const variant = VARIANT_PROP.exec(read(prop).trim())?.[2];
          if (variant) {
            found.push({ names, variant, from: prop.from, to: prop.to });
          }
        }
      }
      visit(child);
    }
  };
  visit(layout);
  return found;
}

export function variantLayouts(
  sparkle: Sparkle | undefined,
  kind: string,
  variant: string,
): string[] {
  return Object.keys(sparkle?.layouts ?? {}).filter((layout) =>
    layoutVariantLimits(sparkle, layout).some(
      (limit) => limit.variant === variant && elementNames(limit.node).includes(kind),
    ),
  );
}
