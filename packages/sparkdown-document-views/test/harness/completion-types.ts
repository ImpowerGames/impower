export const COMPLETION_ICON_COLORS = {
  method: "--syntax-function-name",
  function: "--syntax-function-name",
  constructor: "--syntax-function-name",
  variable: "--syntax-variable-name",
  field: "--syntax-property-name",
  typeParameter: "--syntax-type-name",
  constant: "--syntax-constant-variable-name",
  class: "--syntax-class-name",
  interface: "--syntax-type-name",
  struct: "--syntax-class-name",
  event: "--syntax-class-name",
  operator: "--syntax-operator",
  module: "--syntax-module-keyword",
  property: "--syntax-property-name",
  value: "--syntax-constant-variable-name",
  enum: "--syntax-type-name",
  enumMember: "--syntax-constant-variable-name",
  reference: "--syntax-section-name-accessor",
  keyword: "--syntax-plain-keyword",
  file: "--syntax-string",
  folder: "--syntax-string",
  color: "--syntax-number",
  unit: "--syntax-number",
  snippet: "--syntax-builtin",
  text: "--syntax-text",
  boolean: "--syntax-bool",
  array: "--syntax-bracket",
  string: "--syntax-string",
  misc: "--syntax-text",
  numeric: "--syntax-number",
} as const;

export const ICONED_COMPLETION_TYPES = Object.keys(COMPLETION_ICON_COLORS) as (keyof typeof COMPLETION_ICON_COLORS)[];

export const ICONLESS_COMPLETIONS = [
  { label: "unknownItem", type: "unknown" },
  { label: "noTypeItem" },
] as const;
