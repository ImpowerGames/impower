import type {
  DefinitionPropertyMetadata,
  DefinitionPropertyPath,
} from "../types/DefinitionPropertyMetadata";

export interface DefinitionPropertyRegistry {
  context?: Record<string, Record<string, unknown>>;
  definitions?: readonly DefinitionPropertyMetadata[];
  optionals?: Record<string, Record<string, unknown>>;
}

export interface KnownDefinitionProperty {
  value: unknown;
  declaredBy: string;
}

export interface KnownDefinitionProperties {
  properties: Map<string, KnownDefinitionProperty>;
  /** Only this level is open; a described child keeps its own shape. */
  open: boolean;
  recursive: boolean;
  /** False when no type describes the requested level. */
  described: boolean;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const segment = (value: string | number): string | number =>
  typeof value === "number" || /^\d+$/.test(value) ? 0 : value;

const samePath = (a: DefinitionPropertyPath, b: DefinitionPropertyPath) =>
  a.length === b.length && a.every((v, i) => segment(v) === segment(b[i]!));

function atPath(value: unknown, path: DefinitionPropertyPath): unknown {
  let current = value;
  for (const part of path) {
    if (Array.isArray(current)) {
      if (segment(part) !== 0) return undefined;
      current = current[0];
    } else if (object(current)) {
      current = current[String(part)];
    } else return undefined;
  }
  return current;
}

/**
 * Shared compiler/completion lookup. Runtime instance values are deliberately
 * not schemas: only defaults, optionals and actual source declarations add
 * names. This prevents an unmarked typo on a parent from legitimizing itself
 * in every descendant.
 */
export function getKnownDefinitionProperties(
  registry: DefinitionPropertyRegistry,
  type: string,
  name: string,
  path: DefinitionPropertyPath = [],
  options: { includeOwnDeclarations?: boolean } = {},
): KnownDefinitionProperties {
  const result: KnownDefinitionProperties = {
    properties: new Map(), open: false, recursive: false, described: false,
  };
  const definitions = registry.definitions ?? [];
  const seen = new Set<string>();
  const addValue = (value: unknown, owner: string) => {
    const level = atPath(value, path);
    if (!object(level) && !Array.isArray(level)) return;
    result.described = true;
    if (object(level)) {
      for (const [key, value] of Object.entries(level)) {
        if (!key.startsWith("$") && !result.properties.has(key)) {
          result.properties.set(key, { value, declaredBy: owner });
        }
      }
    }
  };
  const addMetadata = (metadata: DefinitionPropertyMetadata, includeProperties = true) => {
    for (const open of metadata.openPaths) {
      if (samePath(open, path)) {
        result.open = true;
        result.described = true;
      }
    }
    if (!includeProperties) return;
    for (const property of metadata.properties) {
      if (!(metadata.root || property.declared || property.declaredByBlock)) continue;
      if (property.path.length <= path.length) continue;
      if (!samePath(property.path.slice(0, path.length), path)) continue;
      const key = property.path[path.length];
      if (typeof key !== "string") continue;
      result.described = true;
      if (!result.properties.has(key)) {
        result.properties.set(key, {
          value: property.path.length === path.length + 1 ? property.value : {},
          declaredBy: metadata.root ? metadata.type : metadata.name,
        });
      }
    }
  };
  const visit = (currentType: string, currentName: string, own: boolean) => {
    const identity = JSON.stringify([currentType, currentName]);
    if (seen.has(identity)) return;
    seen.add(identity);
    const structs = registry.context?.[currentType];
    const defaults = structs?.["$default"];
    if (object(defaults) && defaults["$recursive"] === true) result.recursive = true;
    // Prefer the most specific optional/default values in completion details.
    addValue(structs?.[`$optional:${currentName}`], currentType);
    addValue(structs?.["$optional"], currentType);
    addValue(registry.optionals?.[currentType]?.["$optional"], currentType);
    addValue(defaults, currentType);
    const metadata = definitions.find((d) => d.type === currentType && d.name === currentName);
    if (metadata) addMetadata(metadata, !own || options.includeOwnDeclarations !== false);
    if (metadata?.parent) visit(metadata.parent.type, metadata.parent.name, false);
    // `define companion as character` introduces the type companion, without
    // creating context.companion.$default. Resolve it from source identity.
    const typeDeclaration = definitions.find((d) => d.definesType && !d.root && d.name === currentType);
    if (typeDeclaration && typeDeclaration !== metadata) {
      addMetadata(typeDeclaration);
      if (typeDeclaration.parent) visit(typeDeclaration.parent.type, typeDeclaration.parent.name, false);
    }
    const root = definitions.find((d) => d.root && d.type === currentType);
    if (root && root !== metadata) addMetadata(root);
    // Structural `animation child as parent` keeps the implicit type and uses
    // a named ancestor in that type. Its authored values still aren't schemas.
    const instance = structs?.[currentName];
    if (object(instance) && typeof instance["$extends"] === "string") {
      visit(currentType, instance["$extends"], false);
    }
  };
  visit(type, name, true);
  return result;
}
