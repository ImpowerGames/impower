import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

export interface LanguageData {
  commentTokens?: {
    block?: { open?: string; close?: string };
    line?: string;
  };

  closeBrackets?: {
    brackets?: string[];
    before?: string;
  };

  wordChars?: string;

  autocomplete?: (
    context: CompletionContext
  ) => CompletionResult | Promise<CompletionResult | null> | null;
}
