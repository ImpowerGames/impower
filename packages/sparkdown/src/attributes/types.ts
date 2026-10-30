export type AttributeSelection = Record<string, string>;

export interface AttributeDiagnostic {
  code: string;
  message: string;
  severity: "warning" | "error";
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
  defaults: Record<string, string[]>;
  options: Record<string, string[]>;
}

export interface AttributeVocabulary {
  version: number;
  layers: AttributeLayer[];
  folders: Record<string, AttributeFolder>;
  groups: Record<string, { options: string[]; switch: boolean }>;
  diagnostics: AttributeDiagnostic[];
}
