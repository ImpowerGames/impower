export interface ConfigDefinition {
  comments?: {
    lineComment?: string;
    blockComment?: string[];
  };
  brackets?: string[][];
  autoClosingPairs?: { open: string; close: string; notIn?: string[] }[];
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
  onEnterRules?: {
    beforeText: string;
    afterText?: string;
    previousLineText?: string;
    action: {
      indent: "none" | "indent" | "outdent" | "indentOutdent";
      appendText?: string;
      deleteText?: string;
      removeText?: number;
    };
  }[];
  folding?: {
    markers?: {
      start?: string;
      end?: string;
    };
  };
}
