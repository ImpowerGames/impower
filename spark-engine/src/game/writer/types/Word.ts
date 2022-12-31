import { Syllable } from "./Syllable";

export interface Word {
  text: string;
  italicized?: boolean;
  bolded?: boolean;
  underlined?: boolean;
  yelled?: boolean;
  syllables: Syllable[];
}
