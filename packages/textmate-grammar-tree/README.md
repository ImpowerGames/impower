# textmate-grammar-tree

Use textmate grammars to parse text into a non-abstract syntax tree.
The tree can be used to do highlighting and basic semantic analysis.

1. Regex-based Textmate Grammar Definition

Write your grammars declaratively (e.g. in a [TextMate Grammar](https://macromates.com/manual/en/language_grammars) JSON file.)
This is the same format used for [vscode syntax highlighting](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide).

2. Incremental Lezer Parser

Use `TextmateGrammarParser` to parse text into a memory-efficient [lezer](https://lezer.codemirror.net/) syntax tree. You can parse text fully, or incrementally as the text changes.

## Thanks / Third-party licenses

Originally forked from cm-tarnation [cm-tarnation](https://github.com/Monkatraz/cm-tarnation) by Monkatraz, covered by the [MPL 2.0 License](https://github.com/Monkatraz/cm-tarnation/blob/master/LICENSE)

Utilizes [@lezer/common](https://lezer.codemirror.net/) for its parser, tree structure, and tree iterators