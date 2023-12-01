import { Chunk } from "./Chunk";

export interface Phrase {
  tag?: string;
  prerequisite?: string;
  text?: string | undefined;
  target?: string | undefined;
  image?: string[] | undefined;
  audio?: string[] | undefined;
  args?: string[] | undefined;
  speed?: number;
  chunks?: Chunk[];
  ignore?: boolean;
}
