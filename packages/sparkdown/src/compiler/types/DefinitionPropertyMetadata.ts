/** A property path; numeric segments describe list items. */
export type DefinitionPropertyPath = readonly (string | number)[];

/** Offsets relative to the definition's compiled chunk. */
export interface DefinitionPropertySpan {
  from: number;
  to: number;
}

export interface DefinitionPropertyEntry {
  path: DefinitionPropertyPath;
  key: DefinitionPropertySpan;
  /** The property explicitly carries `declare`. */
  declared: boolean;
  /** A containing block carries `declare`. */
  declaredByBlock?: boolean;
  /** A static value, when available; not required to know a property name. */
  value?: unknown;
}

/** Author-written shape, before defaults and ancestors are merged into values. */
export interface DefinitionPropertyMetadata {
  type: string;
  name: string;
  /** Root defines declare every key, including keys without `declare`. */
  root: boolean;
  /** Only an OOP `define` introduces a type usable by a later `as T`. */
  definesType?: boolean;
  /** A structural parent's type/name, or a define's parent type/$default. */
  parent?: { type: string; name: string };
  properties: readonly DefinitionPropertyEntry[];
  openPaths: readonly DefinitionPropertyPath[];
}

/** A chunk's metadata placed in the current compilation's document. */
export interface LocatedDefinitionPropertyMetadata extends DefinitionPropertyMetadata {
  uri: string;
  from: number;
}
