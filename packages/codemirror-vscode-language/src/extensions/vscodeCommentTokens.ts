import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorState, Extension } from "@codemirror/state";
import { type LanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import { CodeMirrorLanguageData } from "../types/CodeMirrorLanguageData";
import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";

const PARSE_TIMEOUT_MS = 100;

type CommentTokens =NonNullable<CodeMirrorLanguageData["commentTokens"]>;

const commentTokensOf = (
  config: VSCodeConfigDefinition | undefined,
): CommentTokens | undefined => {
  const comments = config?.comments;
  if (!comments) {
    return undefined;
  }
  const tokens: CommentTokens = {};
  if (comments.lineComment) {
    tokens.line = comments.lineComment;
  }
  const [open, close] = comments.blockComment ?? [];
  if (open && close) {
    tokens.block = { open, close };
  }
  return tokens;
};

export const vscodeCommentTokens = (
  reader: LanguageReader,
  documentLanguage: string,
  configs: Readonly<Record<string, VSCodeConfigDefinition>>,
): Extension => {
  const tokensByLanguage = new Map<string, CommentTokens | undefined>(
    Object.entries(configs).map(([language, config]) => [
      language,
      commentTokensOf(config),
    ]),
  );
  return EditorState.languageData.of((state, pos) => [
    {
      get commentTokens() {
        const tree =
          ensureSyntaxTree(
            state,
            state.doc.lineAt(pos).to,
            PARSE_TIMEOUT_MS,
          ) ?? syntaxTree(state);
        const language = reader.cursor(
          tree,
          state.doc,
          pos,
          documentLanguage,
        );
        return (
          (tokensByLanguage.has(language)
            ? tokensByLanguage.get(language)
            : tokensByLanguage.get(documentLanguage)) ?? {}
        );
      },
    },
  ]);
};
