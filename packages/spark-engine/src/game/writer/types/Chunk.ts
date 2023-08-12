import { IElement } from "../../ui";

export interface Chunk {
  char: string;
  duration: number;
  startOfWord: boolean;
  startOfSyllable: boolean;
  voiced: boolean;
  yelled: boolean;
  italicized: boolean;
  bolded: boolean;
  underlined: boolean;
  punctuated: boolean;
  emDash: boolean;
  tilde: boolean;
  sustained: boolean;
  time?: number;
  stressLevel?: number;
  element?: IElement;
}
