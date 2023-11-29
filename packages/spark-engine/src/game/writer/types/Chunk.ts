import { IElement } from "../../ui";

export interface Chunk {
  char: string;
  duration: number;
  speed: number;
  startOfWord?: boolean;
  startOfSyllable?: boolean;
  voiced?: boolean;
  yelled?: number;
  centered?: number;
  bolded?: number;
  italicized?: number;
  underlined?: number;
  floating?: number;
  trembling?: number;
  punctuated?: boolean;
  emDash?: boolean;
  tilde?: boolean;
  sustained?: boolean;
  pitch?: number;
  time?: number;
  wrapper?: IElement;
  element?: IElement;
  image?: IElement;
}
