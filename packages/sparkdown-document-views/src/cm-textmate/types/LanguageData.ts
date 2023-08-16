export interface LanguageData {
  commentTokens?: {
    block?: { open?: string; close?: string };
    line?: string;
  };

  closeBrackets?: {
    brackets?: string[];
    before?: string;
  };

  surroundBrackets?: {
    brackets?: string[];
    before?: string;
  };

  wordChars?: string;
}
