export interface IInstruction {
  control?: string;
  after?: number;
  over?: number;
  exit?: number;
  fadeto?: number;
  with?: string;
  withAfter?: number;
  withOver?: number;
}

export interface TextInstruction extends IInstruction {
  text: string;
  style?: {
    position?: string;
    inset?: string;
    text_decoration?: string;
    font_style?: string;
    font_weight?: string;
    text_align?: string;
    white_space?: string;
    background_color?: string;
    animation_name?: string;
    animation_timing_function?: string;
    animation_iteration_count?: string;
    animation_duration?: string;
    animation_delay?: string;
  };
}

export interface ImageInstruction extends IInstruction {
  assets?: string[];
  loop?: boolean;
  style?: {
    position?: string;
    inset?: string;
  };
}

export interface AudioInstruction extends IInstruction {
  assets?: string[];
  now?: boolean;
  loop?: boolean;
}

export type Instruction = TextInstruction | ImageInstruction | AudioInstruction;
