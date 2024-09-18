export interface IInstruction {
  control?: string;
  after?: number;
  over?: number;
  wait?: boolean;
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
    animation_iteration_count?: string | number;
    animation_duration?: string | number;
    animation_delay?: string | number;
  };
}

export interface ImageInstruction extends IInstruction {
  assets?: string[];
  with?: string;
  style?: {
    position?: string;
    inset?: string;
  };
}

export interface AudioInstruction extends IInstruction {
  assets?: string[];
  now?: boolean;
  loop?: boolean;
  fadeto?: number;
}

export type Instruction = TextInstruction | ImageInstruction | AudioInstruction;
