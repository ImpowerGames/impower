import { Chunk } from "./Chunk";

export interface Phrase {
  target?: string;
  instance?: number;
  button?: string;
  text?: string;
  image?: string[];
  audio?: string[];
  args?: string[];

  chunks?: Chunk[];
}
