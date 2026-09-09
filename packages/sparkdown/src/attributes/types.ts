export type AttributeSelection = Record<string, string>;

export interface AttributeDiagnostic {
  code: string;
  message: string;
  severity: "warning" | "error";
  /** Stable source hierarchy key; not an XML text range. */
  path?: string;
  layer?: string;
  folder?: string;
  attribute?: string;
  group?: string;
}

export interface LayerCondition {
  group: string;
  options: string[];
}

export interface ParsedLayerName {
  label: string;
  conditions: LayerCondition[];
  default: boolean;
  diagnostics: AttributeDiagnostic[];
}

export interface AttributeLayerInput {
  key: string;
  name: string;
  parent?: string;
  id?: string;
}

export interface AttributeLayer extends AttributeLayerInput {
  parent: string;
  parsed: ParsedLayerName;
}

export interface AttributeFolder {
  name: string;
  parent?: string;
  // Conflicting defaults are reported, but all artist-marked resting options
  // remain visible until the artist fixes the file or the script selects one.
  defaults: Record<string, string[]>;
  options: Record<string, string[]>;
}

/** JSON-only metadata; no XML, geometry, DOM nodes, Maps or Sets cross hosts. */
export interface AttributeVocabulary {
  version: number;
  layers: AttributeLayer[];
  folders: Record<string, AttributeFolder>;
  groups: Record<string, { options: string[]; switch: boolean }>;
  diagnostics: AttributeDiagnostic[];
}
