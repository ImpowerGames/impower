import { Chunk } from "./Chunk";

export interface Phrase {
  text?: string | undefined;
  layer?: string | undefined;
  image?: string[] | undefined;
  audio?: string[] | undefined;
  args?: string[] | undefined;
  chunks?: Chunk[];
}
