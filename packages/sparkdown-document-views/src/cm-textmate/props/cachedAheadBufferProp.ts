import { NodeProp } from "@lezer/common";
import { ChunkBuffer } from "../../../../grammar-compiler/src";

export const cachedAheadBufferProp = new NodeProp<ChunkBuffer>({
  perNode: true,
});
