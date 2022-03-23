import {
  acceptCompletion,
  autocompletion,
  clearSnippet,
  closeCompletion,
  moveCompletionSelection,
  nextSnippetField,
  prevSnippetField,
  selectedCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/basic-setup";
import { html } from "@codemirror/lang-html";
import {
  Language,
  LanguageDescription,
  LanguageSupport,
} from "@codemirror/language";
import { Diagnostic, linter } from "@codemirror/lint";
import { EditorSelection, Prec } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/tooltip";
import { KeyBinding, keymap } from "@codemirror/view";
import {
  FountainParseResult,
  parseFountain,
} from "../../impower-script-parser";
import { MarkdownParser } from "../classes/MarkdownParser";
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
} from "../constants/commands";
import { sectionNamePreview } from "../extensions/sectionNamePreview";
import { MarkdownExtension } from "../types/markdownExtension";
import { fountainAutocomplete } from "./fountainAutocomplete";
import {
  commonmarkLanguage,
  fountainLanguage,
  getCodeParser,
  mkLang,
} from "./fountainLanguage";
import { fountainTooltip } from "./fountainTooltip";
import { parseCode } from "./nest";

export {
  commonmarkLanguage,
  fountainLanguage,
  insertNewlineContinueMarkup,
  deleteMarkupBackward,
};

/// A small keymap with Markdown-specific bindings. Binds Enter to
/// [`insertNewlineContinueMarkup`](#lang-markdown.insertNewlineContinueMarkup)
/// and Backspace to
/// [`deleteMarkupBackward`](#lang-markdown.deleteMarkupBackward).
export const markdownKeymap: readonly KeyBinding[] = [
  { key: "Enter", run: insertNewlineContinueMarkup },
  { key: "Backspace", run: deleteMarkupBackward },
];

const snippetKeymap = [
  { key: "Escape", run: clearSnippet },
  {
    key: "Tab",
    run: nextSnippetField,
    shift: prevSnippetField,
  },
  {
    key: "Enter",
    run: (target: EditorView): boolean => {
      const selected = selectedCompletion(target.state);
      const accepted = acceptCompletion(target);
      const next = nextSnippetField(target);
      if (!next && selected && !(selected as { inline?: boolean })?.inline) {
        const end = target.state.doc.lineAt(
          target.state.selection.main.head
        ).to;
        target.dispatch({
          selection: {
            anchor: end,
            head: end,
          },
        });
      }
      return accepted || next;
    },
    shift: prevSnippetField,
  },
];

export const completionKeymap: readonly KeyBinding[] = [
  { key: "Ctrl-Space", run: startCompletion },
  { key: "Escape", run: closeCompletion },
  { key: "ArrowDown", run: moveCompletionSelection(true) },
  { key: "ArrowUp", run: moveCompletionSelection(false) },
  { key: "PageDown", run: moveCompletionSelection(true, "page") },
  { key: "PageUp", run: moveCompletionSelection(false, "page") },
  {
    key: "Enter",
    run: (target: EditorView): boolean => {
      const accepted = acceptCompletion(target);
      const next = nextSnippetField(target);
      return accepted || next;
    },
  },
];
const htmlNoMatch = html({ matchClosingTags: false });

/// Markdown language support.
export function fountain(
  config: {
    /// When given, this language will be used by default to parse code
    /// blocks.
    defaultCodeLanguage?: Language | LanguageSupport;
    /// A collection of language descriptions to search through for a
    /// matching language (with
    /// [`LanguageDescription.matchLanguageName`](#language.LanguageDescription^matchLanguageName))
    /// when a fenced code block has an info string.
    codeLanguages?: readonly LanguageDescription[];
    /// Set this to false to disable installation of the Markdown
    /// [keymap](#lang-markdown.markdownKeymap).
    addKeymap?: boolean;
    /// Markdown parser
    /// [extensions](https://github.com/lezer-parser/markdown#user-content-markdownextension)
    /// to add to the parser.
    extensions?: MarkdownExtension;
    /// The base language to use. Defaults to
    /// [`commonmarkLanguage`](#lang-markdown.commonmarkLanguage).
    base?: Language;
    initialParseResult?: FountainParseResult;
    /// Callback to execute when doc is parsed
    parse: (script: string) => FountainParseResult;
    getRuntimeValue?: (id: string) => string | number | boolean;
    setRuntimeValue?: (id: string, expression: string) => void;
  } = { parse: parseFountain }
): LanguageSupport {
  const {
    codeLanguages,
    defaultCodeLanguage,
    addKeymap = true,
    base: { parser } = commonmarkLanguage,
    parse,
    getRuntimeValue,
    setRuntimeValue,
    initialParseResult,
  } = config;
  if (!(parser instanceof MarkdownParser)) {
    throw new RangeError(
      "Base parser provided to `markdown` should be a Markdown parser"
    );
  }
  const parseContext: {
    result: FountainParseResult;
  } = { result: initialParseResult };
  const fountainParseLinter = (view: EditorView): Diagnostic[] => {
    parseContext.result = parse(view.state.doc.toString());
    const diagnostics = parseContext.result?.diagnostics || [];
    return diagnostics.map((d) => ({
      ...d,
      actions: d.actions.map((a) => ({
        ...a,
        apply: (view: EditorView, _from: number, _to: number): void => {
          if (a.focus) {
            view.dispatch({
              selection: { anchor: a.focus.from, head: a.focus.to },
              effects: EditorView.scrollIntoView(
                EditorSelection.range(a.focus.from, a.focus.to),
                { y: "center" }
              ),
            });
            view.focus();
          }
          if (a.changes?.length > 0) {
            const lastChange = a.changes[a.changes.length - 1];
            const cursor =
              lastChange.insert != null
                ? lastChange.from + lastChange.insert.length
                : lastChange.from;
            view.dispatch({
              changes: a.changes,
              selection: { anchor: cursor, head: cursor },
            });
          }
        },
      })),
    }));
  };
  const extensions = config.extensions ? [config.extensions] : [];
  const support = [
    htmlNoMatch.support,
    fountainLanguage.data.of({
      autocomplete: async (c) => fountainAutocomplete(c, parseContext),
    }),
    autocompletion({ aboveCursor: true, defaultKeymap: false }),
    hoverTooltip((v, p, s) =>
      fountainTooltip(v, p, s, parseContext, getRuntimeValue, setRuntimeValue)
    ),
    sectionNamePreview({ parseContext }),
    linter(fountainParseLinter, { delay: 100 }),
  ];
  let defaultCode;
  if (defaultCodeLanguage instanceof LanguageSupport) {
    support.push(defaultCodeLanguage.support);
    defaultCode = defaultCodeLanguage.language;
  } else if (defaultCodeLanguage) {
    defaultCode = defaultCodeLanguage;
  }
  const codeParser =
    codeLanguages || defaultCode
      ? getCodeParser(codeLanguages || [], defaultCode)
      : undefined;
  extensions.push(
    parseCode({ codeParser, htmlParser: htmlNoMatch.language.parser })
  );

  if (addKeymap) {
    support.push(Prec.high(keymap.of(markdownKeymap)));
    support.push(Prec.highest(keymap.of(snippetKeymap)));
    support.push(Prec.highest(keymap.of(completionKeymap)));
  }
  return new LanguageSupport(mkLang(parser.configure(extensions)), support);
}
