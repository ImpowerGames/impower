# CodeMirror VSCode Language

Use vscode .language-grammar.json and .language-config.json files to power codemirror 6 syntax highlighting, indentation, bracket matching, on-enter rules, and more.

This allows language developers to write one grammar and config file and have complete feature parity for their language in both vscode and codemirror.

See VSCode's [Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide) and [Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide) for more details.

## Install

```
npm install @impower/codemirror-vscode-language @impower/textmate-grammar-tree
npm install @codemirror/state @codemirror/view @codemirror/language @codemirror/autocomplete
npm install @lezer/common
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

```json
{
  "scopeName": "text.source.mycustomlang",
  "fileTypes": ["mcl"],
  "patterns": [{ "include": "#Expression" }],
  "repository": {
    "Expression": {
      "patterns": [{ "include": "#Keyword" }, { "include": "#ParenExpression" }]
    },
    "Keyword": {
      "tag": "keyword",
      "match": "this|grammar"
    },
    "ParenExpression": {
      "brackets": true,
      "begin": "\\(",
      "beginCaptures": {
        "0": { "tag": "paren" }
      },
      "patterns": [{ "include": "#Expression" }],
      "end": "\\)",
      "endCaptures": {
        "0": { "tag": "paren" }
      }
    }
  }
}
```

---

### "tag":

Include a codemirror-specific "tag" field inside any nodes you want to be syntax highlighted in codemirror.

(In the example above, the words `this` and `grammar` are highlighted as `keyword`. And `(` and `)` are highlighted as `paren` )

Tag modifiers are also supported: e.g. `"tag": "constant(variableName)"`

> [!NOTE]
> "name" fields are completely ignored by codemirror, but can be safely included alongside any "tag" fields in your grammar to support syntax highlighting in vscode.
>
> For example: `{"tag":"paren", "name":"punctuation.paren.open"}`

---

### "brackets":

Include `"brackets": true` inside any nodes whose begin and end pattern should be highlighted as matching brackets.

(In the example above, since brackets is set to true inside the `ParenExpression` rule, the begin and end parenthesis will be properly highlighted by codemirror's bracketMatching extension)

---
