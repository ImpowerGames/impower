export interface ConfigDefinition {
  comments?: {
    lineComment?: string;
    blockComment?: string[];
  };
  brackets?: string[][];
  autoClosingPairs?: { open: string; close: string; notIn?: string[] }[];
  autoCloseBefore?: string;
  surroundingPairs?: string[][];
  wordChars?: string;
  wordPattern?: {
    pattern: string;
    flags: string;
  };
  indentationRules?: {
    increaseIndentPattern?: string;
    decreaseIndentPattern?: string;
  };
  folding?: {
    markers?: {
      start?: string;
      end?: string;
    };
  };
}
