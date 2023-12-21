import { Chunk } from "./Chunk";

export interface Phrase {
  target?: string | undefined;
  text?: string | undefined;
  image?: string[] | undefined;
  audio?: string[] | undefined;
  args?: string[] | undefined;
  speed?: number;
  ignore?: boolean;

  chunks?: Chunk[];
}
