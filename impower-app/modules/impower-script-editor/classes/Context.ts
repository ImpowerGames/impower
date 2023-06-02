import { Text } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { itemNumber } from "../utils/itemNumber";

export class Context {
  readonly node: SyntaxNode;

  readonly from: number;

  readonly to: number;

  readonly spaceBefore: string;

  readonly spaceAfter: string;

  readonly type: string;

  readonly item: SyntaxNode | null;

  constructor(
    node: SyntaxNode,
    from: number,
    to: number,
    spaceBefore: string,
    spaceAfter: string,
    type: string,
    item: SyntaxNode | null
  ) {
    this.node = node;
    this.from = from;
    this.to = to;
    this.spaceBefore = spaceBefore;
    this.spaceAfter = spaceAfter;
    this.type = type;
    this.item = item;
  }

  blank(trailing = true): string {
    let result = this.spaceBefore;
    for (
      let i = this.to - this.from - result.length - this.spaceAfter.length;
      i > 0;
      i -= 1
    ) {
      result += " ";
    }
    return result + (trailing ? this.spaceAfter : "");
  }

  marker(doc: Text, add: number): string {
    const number =
      this.node.name === "OrderedList"
        ? String(+itemNumber(this.item, doc)[2] + add)
        : "";
    return this.spaceBefore + number + this.type + this.spaceAfter;
  }
}
