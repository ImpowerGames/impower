export interface Chunk {
  tag?: string;
  control?: string;
  text?: string;
  assets?: string[];
  args?: string[];

  voicedSyllable?: boolean;
  punctuatedSyllable?: boolean;
  pitch?: number;

  speed: number;

  duration: number;

  voiced?: boolean;
  yelled?: number;
  tilde?: boolean;

  raw?: boolean;

  centered?: number;
  bolded?: number;
  italicized?: number;
  underlined?: number;
  wavy?: number;
  shaky?: number;
}
