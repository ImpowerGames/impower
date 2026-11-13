import type {
  PreviewBeat,
  PreviewBeatKind,
  PreviewLine,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { displayCaptionText } from "@impower/sparkdown/src/compiler/lower/lowerers/lowerDisplay";
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

const CHOOSE = "LuauSparkdownChooseBlock";

const THEN_CLAUSE = "LuauSparkdownChooseThenClause";

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

interface Flow {
  start: number;
  end: number;
}

interface Beat {
  kind: PreviewBeatKind;
  node: SyntaxNode;
  start: number;
  position: number;
  lines: Set<number>;
  flow: Flow | null;
  caption?: SyntaxNode;
  options?: SyntaxNode[];
}

interface Segment {
  line: number;
  words: string[];
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
  const source = {
    read,
    characterNumber: (pos: number) => document.positionAt(pos).character,
  };
  const firstLine = (node: SyntaxNode) => document.positionAt(node.from).line;
  const lastLine = (node: SyntaxNode) =>
    document.positionAt(Math.max(node.from, node.to - 1)).line;
  const linesOf = (node: SyntaxNode) => span(firstLine(node), lastLine(node));
  const lineStart = (l: number) => document.offsetAt({ line: l, character: 0 });
  const clean = (text: string) => text.replace(/\s+/g, " ").trim();
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
  const segmentsOf = (node: SyntaxNode) => {
    const breaks = descendants(node, "Break").map((mark) => mark.to);
    const segmentAt = (offset: number) =>
      breaks.filter((end) => end <= offset).length;
    const segments: Segment[] = [];
    for (const chunk of descendants(node, "TextChunk")) {
      const words = clean(readSkipping(chunk, read, (d) => MARKUP.has(d.name)));
      if (words) {
        const segment = (segments[segmentAt(chunk.from)] ??= {
          line: firstLine(chunk),
          words: [],
        });
        segment.words.push(words);
      }
    }
    return { segments, segmentAt };
  };
  const spoken = (segment: Segment | undefined): segment is Segment =>
    !!segment?.words.length;

  const beats: Beat[] = [];
  const flows: Flow[] = [];
  const open: Flow[] = [];
  const setup: Set<number>[] = [];
  const flowOf = () => open.at(-1) ?? null;

  const visitNode = (node: SyntaxNode) => {
    const name = node.name;
    if (SETUP.has(name)) {
      setup.push(linesOf(node));
      return;
    }
    if (name === "Scene" || name === "Branch") {
      const start = firstLine(node);
      if (name === "Scene") {
        while (open.length) {
          open.pop()!.end = start - 1;
        }
      }
      const flow = { start, end: Infinity };
      flows.push(flow);
      open.push(flow);
      return;
    }
    if (name === "LuauEndKeyword" && node.parent?.name === "sparkdown") {
      const flow = open.pop();
      if (flow) {
        flow.end = firstLine(node);
      }
      return;
    }
    const kind = DISPLAY[name];
    if (kind) {
      beats.push({
        kind,
        node,
        start: firstLine(node),
        position: firstLine(node),
        lines: linesOf(node),
        flow: flowOf(),
      });
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
      position: firstLine(block),
      lines: new Set([firstLine(block), lastLine(block)]),
      flow: flowOf(),
      options: [],
    };
    beats.push(beat);
    const content = block.getChild(`${CHOOSE}_content`);
    let optionsEnded = false;
    for (let child = content?.firstChild; child; child = child.nextSibling) {
      if (child.name === "Choice") {
        beat.options!.push(child);
        linesOf(child).forEach((l) => beat.lines.add(l));
      } else if (child.name === THEN_CLAUSE) {
        optionsEnded = true;
        visitNode(child);
      } else if (
        !optionsEnded &&
        !beat.options!.length &&
        displayCaptionText(child, source) !== undefined
      ) {
        if (beat.caption) {
          beats.push({
            kind: DISPLAY[beat.caption.name] ?? "action",
            node: beat.caption,
            start: firstLine(beat.caption),
            position: firstLine(beat.caption),
            lines: linesOf(beat.caption),
            flow: beat.flow,
          });
        }
        beat.caption = child;
      } else {
        visitNode(child);
      }
    }
    if (beat.caption) {
      linesOf(beat.caption).forEach((l) => beat.lines.add(l));
    }
    const shownFrom = beat.caption ?? beat.options![0];
    beat.position = shownFrom ? firstLine(shownFrom) : beat.start;
  };

  visit(tree.topNode);

  const onlyComments = () => {
    const from = lineStart(line);
    const to =
      line + 1 < document.lineCount ? lineStart(line + 1) : document.length;
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
      const caption = beat.caption ? segmentsOf(beat.caption).segments : [];
      const question = caption.filter(spoken).at(-1);
      return {
        kind: "choice",
        line: beat.start,
        words: question
          ? clean(question.words.join(" "))
          : beat.options!.map(optionWords).join(" · "),
      };
    }
    const { segments, segmentAt } = segmentsOf(beat.node);
    const caret = segmentAt(lineStart(line));
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
  const declared = flows.find((flow) => flow.start === line);
  const flow =
    declared ??
    flows
      .filter((f) => f.start <= line && line <= f.end)
      .reduce<Flow | null>(
        (inner, f) => (!inner || f.start > inner.start ? f : inner),
        null,
      );
  const inFlow = beats
    .filter((beat) => beat.flow === flow)
    .sort((a, b) => a.position - b.position);
  const before = declared
    ? undefined
    : inFlow.filter((beat) => beat.position < line).at(-1);
  const after = inFlow.find((beat) => beat.position > line);
  const shown = before ?? after;
  return shown ? describe(shown) : { kind: "empty" };
};
