import { IElement } from "../../ui";

export interface Chunk {
  char: string;
  duration: number;
  startOfWord: boolean;
  startOfSyllable: boolean;
  voiced: boolean;
  yelled: number;
  italicized: number;
  bolded: number;
  underlined: number;
  punctuated: boolean;
  emDash: boolean;
  tilde: boolean;
  sustained: boolean;
  time?: number;
  stressLevel?: number;
  element?: IElement;
}
