import { IElement } from "../../ui";

export interface Chunk {
  char: string;
  duration: number;
  startOfWord: boolean;
  startOfSyllable: boolean;
  startOfEllipsis: boolean;
  voiced: boolean;
  italicized: boolean;
  bolded: boolean;
  underlined: boolean;
  punctuation: boolean;
  ellipsis: boolean;
  yelled: boolean;
  time?: number;
  stressLevel?: number;
  element?: IElement;
}
