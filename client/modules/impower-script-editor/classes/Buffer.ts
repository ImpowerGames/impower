import { NodeSet, Tree } from "@lezer/common";
import { Type } from "../types/type";
import { Element } from "./Element";
import { TreeElement } from "./TreeElement";

export class Buffer {
  content: number[] = [];

  nodes: Tree[] = [];

  readonly nodeSet: NodeSet;

  constructor(nodeSet: NodeSet) {
    this.nodeSet = nodeSet;
  }

  write(type: Type, from: number, to: number, children = 0): Buffer {
    this.content.push(type, from, to, 4 + children * 4);
    return this;
  }

  writeElements(elts: readonly (Element | TreeElement)[], offset = 0): Buffer {
    for (let i = 0; i < elts.length; i += 1) {
      const e = elts[i];
      e.writeTo(this, offset);
    }
    return this;
  }

  finish(type: Type, length: number): Tree {
    return Tree.build({
      buffer: this.content,
      nodeSet: this.nodeSet,
      reused: this.nodes,
      topID: type,
      length,
    });
  }
}
