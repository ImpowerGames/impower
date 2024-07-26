import { Chunk } from "./Chunk";

export interface Phrase {
  tag?: string;
  target?: string;
  button?: string;
  text?: string;
  control?: string;
  assets?: string[];
  args?: string[];

  chunks?: Chunk[];
}
