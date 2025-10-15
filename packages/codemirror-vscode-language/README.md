# CodeMirror VSCode Language

Use vscode .language-grammar.json and .language-config.json files to power codemirror 6 syntax highlighting, indentation, bracket matching, on-enter rules, and more.

This allows language developers to write one grammar and config file and have complete feature parity for their language in both vscode and codemirror.

See VSCode's [Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide) and [Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide) for more details.

## Install

```
npm install @impower/codemirror-vscode-language @impower/textmate-grammar-tree @lezer/common
```

## Usage

```typescript
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { vscodeLanguage } from "@impower/codemirror-vscode-language";
import grammar from "mycustomlang.language-grammar.json";
import config from "mycustomlang.language-config.json";

const doc = `this will be (highlighted) according to my grammar!`;

const highlights = HighlightStyle.define([
  { tag: tags.keyword, color: "#4169E1" },
  { tag: tags.paren, color: "#FFA500" },
]);

new EditorView({
  state: EditorState.create({
    doc,
    extensions: [
      vscodeLanguage({ name: "mycustomlang", grammar, config }),
      syntaxHighlighting(highlights),
    ],
  }),
  parent: document.querySelector("#editor"),
});
```

## Example .language-grammar.json

IMPORTANT: Include a codemirror-specific "tag" field inside any nodes you want to be syntax highlighted in codemirror.

(For example, vscode's `name: "punctuation.paren.open"` is roughly equivalent to codemirror's `tag: "paren"`)

Tag modifiers are also supported: `tag: "constant(variableName)"`

```json
{
  "scopeName": "text.source.mycustomlang",
  "fileTypes": ["mcl"],
  "patterns": [{ "include": "#Expression" }],
  "repository": {
    "Expression": {
      "patterns": [{ "include": "#Letter" }, { "include": "#ParenExpression" }]
    },
    "ParenExpression": {
      "name": "expression.group",
      "begin": "\\(",
      "beginCaptures": {
        "0": { "name": "punctuation.paren.open", "tag": "paren" }
      },
      "patterns": [{ "include": "#Expression" }],
      "end": "\\)",
      "endCaptures": {
        "0": { "name": "punctuation.paren.close", "tag": "paren" }
      }
    },
    "Letter": {
      "name": "keyword.letter",
      "tag": "keyword",
      "match": "a|b|c"
    }
  }
}
```
