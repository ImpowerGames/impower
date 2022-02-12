import { LeafBlockParser } from "../types/leafBlockParser";
import { RefStage } from "../types/refStage";
import { Type } from "../types/type";
import {
  lineEnd,
  parseLinkLabel,
  parseLinkTitle,
  parseURL,
} from "../utils/markdown";
import { skipSpace } from "../utils/skipSpace";
import { BlockContext } from "./BlockContext";
import { Element } from "./Element";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";

// This implements a state machine that incrementally parses link references. At each
// next line, it looks ahead to see if the line continues the reference or not. If it
// doesn't and a valid link is available ending before that line, it finishes that.
// Similarly, on `finish` (when the leaf is terminated by external circumstances), it
// creates a link reference if there's a valid reference up to the current point.
export class LinkReferenceParser implements LeafBlockParser {
  stage = RefStage.Start;

  elts: Element[] = [];

  pos = 0;

  start: number;

  constructor(leaf: LeafBlock) {
    this.start = leaf.start;
    this.advance(leaf.content);
  }

  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (this.stage === RefStage.Failed) {
      return false;
    }
    const content = `${leaf.content}\n${line.scrub()}`;
    const finish = this.advance(content);
    if (finish > -1 && finish < content.length) {
      return this.complete(cx, leaf, finish);
    }
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    if (
      (this.stage === RefStage.Link || this.stage === RefStage.Title) &&
      skipSpace(leaf.content, this.pos) === leaf.content.length
    ) {
      return this.complete(cx, leaf, leaf.content.length);
    }
    return false;
  }

  complete(cx: BlockContext, leaf: LeafBlock, len: number): boolean {
    cx.addLeafElement(
      leaf,
      new Element(Type.LinkReference, this.start, this.start + len, this.elts)
    );
    return true;
  }

  nextStage(elt: Element | null | false): boolean {
    if (elt) {
      this.pos = elt.to - this.start;
      this.elts.push(elt);
      this.stage += 1;
      return true;
    }
    if (elt === false) {
      this.stage = RefStage.Failed;
    }
    return false;
  }

  advance(content: string): number {
    for (;;) {
      if (this.stage === RefStage.Failed) {
        return -1;
      }
      if (this.stage === RefStage.Start) {
        if (
          !this.nextStage(parseLinkLabel(content, this.pos, this.start, true))
        ) {
          return -1;
        }
        if (content.charCodeAt(this.pos) !== 58 /* ':' */) {
          this.stage = RefStage.Failed;
          return this.stage;
        }
        this.elts.push(
          new Element(
            Type.LinkMark,
            this.pos + this.start,
            this.pos + this.start + 1
          )
        );
        this.pos += 1;
      } else if (this.stage === RefStage.Label) {
        if (
          !this.nextStage(
            parseURL(content, skipSpace(content, this.pos), this.start)
          )
        ) {
          return -1;
        }
      } else if (this.stage === RefStage.Link) {
        const skip = skipSpace(content, this.pos);
        let end = 0;
        if (skip > this.pos) {
          const title = parseLinkTitle(content, skip, this.start);
          if (title) {
            const titleEnd = lineEnd(content, title.to - this.start);
            if (titleEnd > 0) {
              this.nextStage(title);
              end = titleEnd;
            }
          }
        }
        if (!end) {
          end = lineEnd(content, this.pos);
        }
        return end > 0 && end < content.length ? end : -1;
      } else {
        // RefStage.Title
        return lineEnd(content, this.pos);
      }
    }
  }
}
