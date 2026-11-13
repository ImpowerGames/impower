import type {
  PreviewBeat,
  PreviewBeatKind,
  PreviewLine,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { readSkipping } from "@impower/sparkdown/src/compiler/utils/readSkipping";
import type { SyntaxNode, Tree } from "@lezer/common";

const SETUP = new Set([
  "FrontMatter",
  "Include",
  "LuauDefine",
  "LuauSparkdownVariableDefinition",
  "LuauStyle",
  "LuauAnimation",
  "LuauTheme",
  "LuauScreen",
  "LuauComponent",
]);

const COMMENTS = new Set([
  "SparkdownLineComment",
  "SparkdownBlockComment",
  "SparkdownInlineComment",
]);

const DISPLAY: Record<string, PreviewBeatKind> = {
  BlockTitle: "title",
  InlineTitle: "title",
  BlockHeading: "heading",
  InlineHeading: "heading",
  BlockTransitional: "transition",
  InlineTransitional: "transition",
  BlockAction: "action",
  InlineAction: "action",
  ImplicitAction: "action",
  BlockDialogue: "dialogue",
  InlineDialogue: "dialogue",
};

const DECLARATIONS = new Set(["Scene", "Branch"]);

const CHOOSE = "LuauSparkdownChooseBlock";

const MARKUP = new Set([
  "Glue",
  "LeadingGlue",
  "BreakLeadingGlue",
  "SparkdownInlineComment",
  "SparkdownBlockComment",
  "SpanOpenMark",
  "SpanCloseMark",
  "Break",
  "ImageCommand",
  "AudioCommand",
  "TextCommand",
]);

interface Beat {
  kind: PreviewBeatKind;
  node: SyntaxNode;
  start: number;
  lines: Set<number>;
  question?: SyntaxNode[];
  options?: SyntaxNode[];
}

const descendants = (node: SyntaxNode, name: string): SyntaxNode[] => {
  const found: SyntaxNode[] = [];
  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.name === name) {
        found.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(node);
  return found;
};

const span = (from: number, to: number): Set<number> => {
  const lines = new Set<number>();
  for (let line = from; line <= to; line += 1) {
    lines.add(line);
  }
  return lines;
};

export const getPreviewLine = (
  document: SparkdownDocument,
  tree: Tree,
  line: number,
): PreviewLine => {
  const read = (from: number, to: number) => document.read(from, to);
  const firstLine = (node: SyntaxNode) => document.positionAt(node.from).line;
  const lastLine = (node: SyntaxNode) =>
    document.positionAt(Math.max(node.from, node.to - 1)).line;
  const linesOf = (node: SyntaxNode) => span(firstLine(node), lastLine(node));
  const clean = (text: string) => text.replace(/\s+/g, " ").trim();
  const wordsOf = (node: SyntaxNode) =>
    clean(
      descendants(node, "TextChunk")
        .map((chunk) => readSkipping(chunk, read, (d) => MARKUP.has(d.name)))
        .join(" "),
    );
  const optionWords = (option: SyntaxNode) => {
    const content = option.getChild("Choice_content");
    return content
      ? clean(
          readSkipping(content, read, (d) => MARKUP.has(d.name)).replace(
            /[[\]]/g,
            "",
          ),
        )
      : "";
  };

  const beats: Beat[] = [];
  const declarations: number[] = [];
  const setup: Set<number>[] = [];

  const visitNode = (node: SyntaxNode) => {
    const name = node.name;
    if (SETUP.has(name)) {
      setup.push(linesOf(node));
      return;
    }
    if (DECLARATIONS.has(name)) {
      declarations.push(firstLine(node));
      return;
    }
    const kind = DISPLAY[name];
    if (kind) {
      beats.push({ kind, node, start: firstLine(node), lines: linesOf(node) });
      return;
    }
    if (name === CHOOSE) {
      visitChoose(node);
      return;
    }
    visit(node);
  };

  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      visitNode(child);
    }
  };

  const visitChoose = (block: SyntaxNode) => {
    const beat: Beat = {
      kind: "choice",
      node: block,
      start: firstLine(block),
      lines: new Set([firstLine(block), lastLine(block)]),
      question: [],
      options: [],
    };
    beats.push(beat);
    const content = block.getChild(`${CHOOSE}_content`);
    for (let child = content?.firstChild; child; child = child.nextSibling) {
      if (child.name === "Choice") {
        beat.options!.push(child);
        linesOf(child).forEach((l) => beat.lines.add(l));
      } else if (!beat.options!.length && DISPLAY[child.name] === "action") {
        beat.question!.push(child);
        linesOf(child).forEach((l) => beat.lines.add(l));
      } else {
        visitNode(child);
      }
    }
  };

  visit(tree.topNode);

  const onlyComments = () => {
    const from = document.offsetAt({ line, character: 0 });
    const to =
      line + 1 < document.lineCount
        ? document.offsetAt({ line: line + 1, character: 0 })
        : document.length;
    const comments: [number, number][] = [];
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (COMMENTS.has(node.name)) {
          comments.push([Math.max(from, node.from), Math.min(to, node.to)]);
          return false;
        }
        return undefined;
      },
    });
    if (!comments.length) {
      return false;
    }
    let rest = "";
    let pos = from;
    for (const [start, end] of comments.sort((a, b) => a[0] - b[0])) {
      rest += read(pos, Math.max(pos, start));
      pos = Math.max(pos, end);
    }
    rest += read(pos, to);
    return rest.trim() === "";
  };

  if (setup.some((lines) => lines.has(line)) || onlyComments()) {
    return { kind: "setup" };
  }

  const describe = (beat: Beat): PreviewBeat => {
    if (beat.kind === "choice") {
      const question = clean(beat.question!.map(wordsOf).join(" "));
      return {
        kind: "choice",
        line: beat.start,
        words: question || beat.options!.map(optionWords).join(" · "),
      };
    }
    const breaks = descendants(beat.node, "Break").map((mark) => mark.to);
    const segmentOf = (offset: number) =>
      breaks.filter((end) => end <= offset).length;
    const segments: { line: number; words: string[] }[] = [];
    for (const chunk of descendants(beat.node, "TextChunk")) {
      const words = clean(
        readSkipping(chunk, read, (d) => MARKUP.has(d.name)),
      );
      if (words) {
        const segment = (segments[segmentOf(chunk.from)] ??= {
          line: firstLine(chunk),
          words: [],
        });
        segment.words.push(words);
      }
    }
    const caret = segmentOf(document.offsetAt({ line, character: 0 }));
    const spoken = (segment: (typeof segments)[number] | undefined) =>
      !!segment?.words.length;
    const shown =
      segments.slice(caret).find(spoken) ??
      segments.slice(0, caret).reverse().find(spoken);
    const name =
      beat.kind === "dialogue"
        ? descendants(beat.node, "DialogueCharacterName")[0]
        : undefined;
    return {
      kind: beat.kind,
      line: shown?.line ?? beat.start,
      words: shown ? clean(shown.words.join(" ")) : "",
      ...(name ? { speaker: clean(read(name.from, name.to)) } : {}),
    };
  };

  const at = beats.find((beat) => beat.lines.has(line));
  if (at) {
    return describe(at);
  }
  const flowStart = Math.max(-1, ...declarations.filter((d) => d <= line));
  const flowEnd = Math.min(Infinity, ...declarations.filter((d) => d > line));
  const before = beats.filter(
    (beat) => beat.start > flowStart && beat.start < line,
  );
  const after = beats.find(
    (beat) => beat.start > line && beat.start < flowEnd,
  );
  const shown = declarations.includes(line)
    ? after
    : (before.at(-1) ?? after);
  return shown ? describe(shown) : { kind: "empty" };
};
