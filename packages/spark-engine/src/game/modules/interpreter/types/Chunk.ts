export interface Chunk {
  tag?: string;
  control?: string;
  target?: string;
  text?: string;
  assets?: string[];
  clauses?: {
    after?: number;
    over?: number;
    fadeto?: number;
    with?: string;
    wait?: boolean;
    loop?: boolean;
    once?: boolean;
    mute?: boolean;
    unmute?: boolean;
    now?: boolean;
  };

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
