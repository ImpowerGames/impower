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
import { indentWithTab } from "@codemirror/commands";
import {
  Language,
  LanguageDescription,
  LanguageSupport,
  indentUnit,
} from "@codemirror/language";
import { Diagnostic, linter } from "@codemirror/lint";
import { Prec } from "@codemirror/state";
import { EditorView, KeyBinding, hoverTooltip, keymap } from "@codemirror/view";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { parseSpark } from "../../../sparkdown/src/utils/parseSpark";
import { MarkdownParser } from "../classes/MarkdownParser";
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
  toggleComment,
} from "../constants/commands";
import { MarkdownExtension } from "../types/markdownExtension";
import { getDiagnostics } from "./getDiagnostics";
import { indentationGuides } from "./indentationGuides";
import { jumpWidget } from "./jumpWidget";
import { parseCode } from "./nest";
import { snippetPreview } from "./snippetPreview";
import { sparkAutocomplete } from "./sparkAutocomplete";
import {
  commonmarkLanguage,
  getCodeParser,
  mkLang,
  sparkLanguage,
} from "./sparkLanguage";
import { sparkTooltip } from "./sparkTooltip";
import { structWidget } from "./structWidget";

export {
  commonmarkLanguage,
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
  sparkLanguage,
};

/// A small keymap with Markdown-specific bindings. Binds Enter to
/// [`insertNewlineContinueMarkup`](#lang-markdown.insertNewlineContinueMarkup)
/// and Backspace to
/// [`deleteMarkupBackward`](#lang-markdown.deleteMarkupBackward).
export const markdownKeymap: readonly KeyBinding[] = [
  { key: "Enter", run: insertNewlineContinueMarkup },
  { key: "Backspace", run: deleteMarkupBackward },
  { key: "Ctrl-/", run: toggleComment },
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

/// Sparkdown language support.
const sparkdown = (
  config: {
    defaultCodeLanguage?: Language | LanguageSupport;
    codeLanguages?: readonly LanguageDescription[];
    addKeymap?: boolean;
    extensions?: MarkdownExtension;
    base?: Language;
    initialDoc: string;
    parse: (script: string) => SparkProgram;
    getRuntimeValue?: (id: string) => unknown;
    setRuntimeValue?: (id: string, expression: string) => void;
    observeRuntimeValue?: (
      listener: (id: string, value: unknown) => void
    ) => void;
    onNavigateUp?: (view: EditorView) => boolean;
    onNavigateDown?: (view: EditorView) => boolean;
  } = { parse: parseSpark, initialDoc: "" }
): LanguageSupport => {
  const {
    codeLanguages,
    defaultCodeLanguage,
    addKeymap = true,
    base: { parser } = commonmarkLanguage,
    initialDoc,
    parse,
    getRuntimeValue,
    setRuntimeValue,
    observeRuntimeValue,
    onNavigateUp,
    onNavigateDown,
  } = config;
  if (!(parser instanceof MarkdownParser)) {
    throw new RangeError(
      "Base parser provided to `markdown` should be a Markdown parser"
    );
  }
  const program = parse(initialDoc);
  const parseContext: {
    program: SparkProgram;
  } = {
    program,
  };
  const sparkParseLinter = (view: EditorView): Diagnostic[] => {
    const script = view.state.doc.toString();
    parseContext.program = parse(script);
    const diagnostics = parseContext.program?.diagnostics || [];
    return getDiagnostics(script, diagnostics);
  };
  const extensions = config.extensions ? [config.extensions] : [];
  const support = [
    sparkLanguage.data.of({
      autocomplete: async (c) => sparkAutocomplete(c, parseContext),
      closeBrackets: {
        brackets: ["(", "[", "{", "'", '"', "`"],
      },
    }),
    indentUnit.of("  "),
    keymap.of([indentWithTab]),
    indentationGuides(),
    autocompletion({ aboveCursor: true, defaultKeymap: false }),
    hoverTooltip((v, p, s) =>
      sparkTooltip(
        v,
        p,
        s,
        parseContext,
        getRuntimeValue,
        setRuntimeValue,
        observeRuntimeValue
      )
    ),
    jumpWidget({ parseContext }),
    structWidget({ parseContext }),
    snippetPreview(),
    linter(sparkParseLinter, { delay: 100 }),
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
  extensions.push(parseCode({ codeParser }));

  if (addKeymap) {
    support.push(Prec.high(keymap.of(markdownKeymap)));
    support.push(Prec.highest(keymap.of(snippetKeymap)));
    support.push(
      Prec.highest(
        keymap.of([
          { key: "Ctrl-Space", run: startCompletion },
          { key: "Escape", run: closeCompletion },
          { key: "ArrowDown", run: moveCompletionSelection(true) },
          { key: "ArrowUp", run: moveCompletionSelection(false) },
          { key: "PageDown", run: moveCompletionSelection(true, "page") },
          { key: "PageUp", run: moveCompletionSelection(false, "page") },
          {
            key: "Enter",
            run: (target: EditorView): boolean => {
              const inserted = insertNewlineContinueMarkup(target);
              parseContext.program = parse(target.state.doc.toString());
              const prompted = startCompletion(target);
              return inserted || prompted;
            },
          },
        ])
      )
    );
    support.push(
      Prec.highest(
        keymap.of([
          { key: "PageUp", run: onNavigateUp },
          { key: "PageDown", run: onNavigateDown },
        ])
      )
    );
  }
  return new LanguageSupport(mkLang(parser.configure(extensions)), support);
};

export default sparkdown;
