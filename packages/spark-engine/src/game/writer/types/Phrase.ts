import { Chunk } from "./Chunk";
import { StressType } from "./StressType";

export interface Phrase {
  text: string;
  chunks: Chunk[];
  finalStressType?: StressType;
}
