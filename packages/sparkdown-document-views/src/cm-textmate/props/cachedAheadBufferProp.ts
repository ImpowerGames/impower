import { NodeProp } from "@lezer/common";
import { ChunkBuffer } from "../../../../grammar-compiler/src/compiler/classes/ChunkBuffer";

export const cachedAheadBufferProp = new NodeProp<ChunkBuffer>({
  perNode: true,
});
