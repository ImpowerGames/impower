import { NodeID } from "../../core";
import { Side } from "../enums/Side";
import { ITreeBuffer } from "../types/ITreeBuffer";
import { checkSide } from "../utils/checkSide";

/**
 * SyntaxTreeBuffers contain (type, start, end, endIndex) quads for each node.
 * In such a buffer, nodes are stored in prefix order (parents before children)
 * with the endIndex of the parent indicating which children belong to it.
 */
export default class TreeBuffer implements ITreeBuffer {
  constructor(
    /**
     * The buffer's content.
     */
    readonly buffer: Uint16Array,
    /**
     * The total length of the group of nodes in the buffer.
     */
    readonly length: number
  ) {}

  /// @internal
  get type() {
    return NodeID.none;
  }

  findChild(
    startIndex: number,
    endIndex: number,
    dir: 1 | -1,
    pos: number,
    side: Side
  ) {
    let { buffer } = this;
    let pick = -1;
    for (let i = startIndex; i != endIndex; i = buffer[i + 3]!) {
      if (checkSide(side, pos, buffer[i + 1]!, buffer[i + 2]!)) {
        pick = i;
        if (dir > 0) {
          break;
        }
      }
    }
    return pick;
  }

  slice(startI: number, endI: number, from: number) {
    let b = this.buffer;
    let copy = new Uint16Array(endI - startI);
    let len = 0;
    for (let i = startI, j = 0; i < endI; ) {
      copy[j++] = b[i++]!;
      copy[j++] = b[i++]! - from;
      let to = (copy[j++] = b[i++]! - from);
      copy[j++] = b[i++]! - startI;
      len = Math.max(len, to);
    }
    return new TreeBuffer(copy, len);
  }
}
