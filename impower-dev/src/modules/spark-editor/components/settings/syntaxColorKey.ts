const ROLE_LABELS: Readonly<Record<string, string>> = {
  "--syntax-text": "Text",
  "--syntax-dialogue": "Dialogue",
  "--syntax-dialogue-untinted": "Dialogue",
  "--syntax-string": "String",
  "--syntax-plain-keyword": "Keyword",
  "--syntax-section-name-definition": "Declared name",
  "--syntax-type-name-definition": "Declared type",
  "--syntax-builtin": "Declaration",
  "--syntax-bool": "Boolean",
  "--syntax-speaker": "Speaker",
  "--syntax-type-name": "Type",
  "--syntax-attribute-name": "Attribute",
  "--syntax-variable-name": "Identifier",
  "--syntax-property-name": "Property",
  "--syntax-number": "Number",
  "--syntax-function-name": "Function",
  "--syntax-comment": "Comment",
  "--syntax-bracket": "Punctuation",
  "--syntax-operator": "Operator",
  "--syntax-regex": "Regex",
  "--syntax-escape": "Escape",
  "--syntax-section-name-accessor": "Heading",
};

export const SYNTAX_KEY_ORDER: readonly string[] = [
  "--syntax-text",
  "--syntax-dialogue",
  "--syntax-dialogue-untinted",
  "--syntax-string",
  "--syntax-plain-keyword",
  "--syntax-control-keyword",
  "--syntax-module-keyword",
  "--syntax-operator-keyword",
  "--syntax-section-name-definition",
  "--syntax-type-name-definition",
  "--syntax-chunk-name-definition",
  "--syntax-builtin",
  "--syntax-bool",
  "--syntax-speaker",
  "--syntax-type-name",
  "--syntax-class-name",
  "--syntax-standard-type",
  "--syntax-attribute-name",
  "--syntax-variable-name",
  "--syntax-constant-variable-name",
  "--syntax-parameter-name",
  "--syntax-property-name",
  "--syntax-number",
  "--syntax-function-name",
  "--syntax-standard-function",
  "--syntax-comment",
  "--syntax-bracket",
  "--syntax-operator",
  "--syntax-special-operator",
  "--syntax-break",
  "--syntax-regex",
  "--syntax-escape",
  "--syntax-section-name-accessor",
  "--syntax-transitional",
  "--syntax-invalid",
];

const derivedLabel = (variable: string) => {
  const words = variable.replace(/^--syntax-/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export type SyntaxKeyRow = { readonly variable: string; readonly label: string };

export const syntaxKeyRows = (rendered: ReadonlySet<string>): SyntaxKeyRow[] =>
  SYNTAX_KEY_ORDER.filter((variable) => rendered.has(variable)).map((variable) => ({
    variable,
    label: ROLE_LABELS[variable] ?? derivedLabel(variable),
  }));
