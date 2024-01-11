export interface Chunk {
  target?: string;
  instance?: number;
  button?: string;
  text?: string;
  image?: string[];
  audio?: string[];
  args?: string[];

  voicedSyllable?: boolean;
  punctuatedSyllable?: boolean;
  pitch?: number;

  speed: number;

  duration: number;

  voiced?: boolean;
  yelled?: number;
  emDash?: boolean;
  tilde?: boolean;

  centered?: number;
  bolded?: number;
  italicized?: number;
  underlined?: number;
  floating?: number;
  trembling?: number;
}
