export interface CodeMirrorLanguageData extends Record<string, any> {
  name?: string;

  alias?: string[];

  extensions?: string[];

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
