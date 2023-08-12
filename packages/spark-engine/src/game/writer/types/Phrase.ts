import { Chunk } from "./Chunk";

export interface Phrase {
  text: string;
  chunks: Chunk[];
}
