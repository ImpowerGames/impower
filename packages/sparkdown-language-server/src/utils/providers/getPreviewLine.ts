import type {
  PreviewBeat,
  PreviewBeatKind,
  PreviewLine,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import {
  displayBeatRanges,
  displayCaptionText,
  type BeatRange,
} from "@impower/sparkdown/src/compiler/lower/lowerers/lowerDisplay";
import { declares } from "@impower/sparkdown/src/compiler/utils/declarationOnly";
import {
  choiceTextRanges,
  type TextRange,
} from "@impower/sparkdown/src/compiler/utils/readChoiceText";
import { readSkipping } from "@impower/sparkdown/src/compiler/utils/readSkipping";
import type { SyntaxNode, Tree } from "@lezer/common";

const SETUP = new Set(["FrontMatter", "Include"]);

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
  range?: BeatRange;
  start: number;
  position: number;
  order: number;
  lines: Set<number>;
  flow: Flow | null;
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
  const source = {
    read,
    characterNumber: (pos: number) => document.positionAt(pos).character,
  };
  const lineAt = (offset: number) => document.positionAt(offset).line;
  const firstLine = (node: SyntaxNode) => lineAt(node.from);
  const lastLine = (node: SyntaxNode) => lineAt(Math.max(node.from, node.to - 1));
  const linesOf = (node: SyntaxNode) => span(firstLine(node), lastLine(node));
  const lineStart = (l: number) => document.offsetAt({ line: l, character: 0 });
  const lineEnd = (l: number) =>
    l + 1 < document.lineCount ? lineStart(l + 1) : document.length;
  const clean = (text: string) => text.replace(/\s+/g, " ").trim();
  const readWithout = (node: SyntaxNode, ranges: readonly TextRange[]) => {
    const marks: [number, number][] = [];
    tree.iterate({
      from: node.from,
      to: node.to,
      enter: (inner) => {
        if (MARKUP.has(inner.name)) {
          marks.push([inner.from, inner.to]);
          return false;
        }
        return undefined;
      },
    });
    let text = "";
    for (const range of ranges) {
      let pos = range.from;
      for (const [from, to] of marks) {
        if (to <= pos || from >= range.to) {
          continue;
        }
        text += read(pos, Math.max(pos, from));
        pos = Math.max(pos, to);
      }
      text += read(pos, Math.max(pos, range.to));
    }
    return text;
  };
  const optionWords = (option: SyntaxNode) =>
    clean(readWithout(option, choiceTextRanges(option).offered.ranges));
  const wordsIn = (node: SyntaxNode, range: BeatRange) =>
    clean(
      descendants(node, "TextChunk")
        .filter((chunk) => chunk.from >= range.from && chunk.from < range.to)
        .map((chunk) => readSkipping(chunk, read, (d) => MARKUP.has(d.name)))
        .join(" "),
    );
  const uncommented = (from: number, to: number) => {
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
    let rest = "";
    let pos = from;
    for (const [start, end] of comments.sort((a, b) => a[0] - b[0])) {
      rest += read(pos, Math.max(pos, start));
      pos = Math.max(pos, end);
    }
    return rest + read(pos, to);
  };

  const beats: Beat[] = [];
  const flows: Flow[] = [];
  const open: Flow[] = [];
  const setup: Set<number>[] = [];
  const flowOf = () => open.at(-1) ?? null;

  const displayBeats = (
    node: SyntaxNode,
    kind: PreviewBeatKind,
    flow: Flow | null,
  ): Beat[] => {
    const ranges = displayBeatRanges(node, source) ?? [];
    const made = ranges.map<Beat>((range) => {
      const start = lineAt(range.from);
      return {
        kind,
        node,
        range,
        start,
        position: start,
        order: range.from,
        lines: span(start, lineAt(Math.max(range.from, range.to - 1))),
        flow,
      };
    });
    for (const l of linesOf(node)) {
      if (made.some((beat) => beat.lines.has(l))) {
        continue;
      }
      const owner = made.find((beat) => beat.start > l) ?? made.at(-1);
      owner?.lines.add(l);
    }
    return made;
  };

  const visitNode = (node: SyntaxNode) => {
    const name = node.name;
    if (SETUP.has(name) || declares(node, read)) {
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
      beats.push(...displayBeats(node, kind, flowOf()));
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
    const flow = flowOf();
    const choice: Beat = {
      kind: "choice",
      node: block,
      start: firstLine(block),
      position: firstLine(block),
      order: block.from,
      lines: new Set([firstLine(block), lastLine(block)]),
      flow,
      options: [],
    };
    beats.push(choice);
    const captions: SyntaxNode[] = [];
    const content = block.getChild(`${CHOOSE}_content`);
    let optionsEnded = false;
    for (let child = content?.firstChild; child; child = child.nextSibling) {
      if (child.name === "Choice") {
        choice.options!.push(child);
        linesOf(child).forEach((l) => choice.lines.add(l));
      } else if (child.name === THEN_CLAUSE) {
        optionsEnded = true;
        visitNode(child);
      } else if (
        !optionsEnded &&
        !choice.options!.length &&
        displayCaptionText(child, source) !== undefined
      ) {
        captions.push(child);
      } else {
        visitNode(child);
      }
    }
    const caption = captions.at(-1);
    for (const earlier of captions.slice(0, -1)) {
      beats.push(...displayBeats(earlier, DISPLAY[earlier.name] ?? "action", flow));
    }
    if (caption) {
      const parts = displayBeats(caption, DISPLAY[caption.name] ?? "action", flow);
      const question = parts.pop();
      beats.push(...parts);
      if (question) {
        question.lines.forEach((l) => choice.lines.add(l));
        choice.node = caption;
        choice.range = question.range;
        choice.order = question.order;
        choice.position = question.start;
      }
    } else if (choice.options![0]) {
      choice.position = firstLine(choice.options![0]);
    }
  };

  visit(tree.topNode);

  const onlyComments = () => {
    const from = lineStart(line);
    const to = lineEnd(line);
    return (
      read(from, to).trim() !== "" && uncommented(from, to).trim() === ""
    );
  };

  if (setup.some((lines) => lines.has(line)) || onlyComments()) {
    return { kind: "setup" };
  }

  const describe = (beat: Beat): PreviewBeat => {
    if (beat.kind === "choice") {
      const question = beat.range ? wordsIn(beat.node, beat.range) : "";
      return {
        kind: "choice",
        words: question || beat.options!.map(optionWords).join(" · "),
      };
    }
    const name =
      beat.kind === "dialogue"
        ? descendants(beat.node, "DialogueCharacterName")[0]
        : undefined;
    return {
      kind: beat.kind,
      words: beat.range ? wordsIn(beat.node, beat.range) : "",
      ...(name ? { speaker: clean(read(name.from, name.to)) } : {}),
    };
  };

  const at = beats
    .filter((beat) => beat.lines.has(line))
    .reduce<Beat | undefined>(
      (last, beat) => (!last || beat.order > last.order ? beat : last),
      undefined,
    );
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
    .sort((a, b) => a.position - b.position || a.order - b.order);
  const before = declared
    ? undefined
    : inFlow.filter((beat) => beat.position < line).at(-1);
  const after = inFlow.find((beat) => beat.position > line);
  const shown = before ?? after;
  return shown ? describe(shown) : { kind: "empty" };
};
