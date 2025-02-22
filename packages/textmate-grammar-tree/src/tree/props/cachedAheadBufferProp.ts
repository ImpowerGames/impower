import { NodeProp } from "@lezer/common";
import { ChunkBuffer } from "../../compiler/classes/ChunkBuffer";

export const cachedAheadBufferProp = new NodeProp<ChunkBuffer>({
  perNode: true,
});
