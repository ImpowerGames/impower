export interface ISequenceEvent {
  instance?: number;
  control?: string;
  after?: number;
  over?: number;
  exit?: number;
  to?: number;
  with?: string;
  withAfter?: number;
  withOver?: number;
}

export interface ButtonEvent extends ISequenceEvent {
  instance: number;
  button: string;
}

export interface TextEvent extends ISequenceEvent {
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

export interface ImageEvent extends ISequenceEvent {
  assets?: string[];
  style?: {
    position?: string;
    inset?: string;
  };
}

export interface AudioEvent extends ISequenceEvent {
  assets?: string[];
  now?: boolean;
  loop?: boolean;
}

export interface EndEvent extends ISequenceEvent {}

export type SequenceEvent = TextEvent | ImageEvent | AudioEvent | EndEvent;
