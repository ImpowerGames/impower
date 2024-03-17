export interface ISequenceEvent {
  instance?: number;
  with?: string;
  after?: number;
  over?: number;
  exit?: number;
}

export interface ButtonEvent extends ISequenceEvent {
  instance: number;
  button: string;
}

export interface TextEvent extends ISequenceEvent {
  text: string;
  style?: {
    position?: string;
    text_decoration?: string;
    font_style?: string;
    font_weight?: string;
    text_align?: string;
    white_space?: string;
    background_color?: string;
    animation?: string;
    animation_delay?: string;
  };
}

export interface ImageEvent extends ISequenceEvent {
  control: string;
  assets?: string[];
}

export interface AudioEvent extends ISequenceEvent {
  control: string;
  assets?: string[];
  gain?: number;
  now?: boolean;
  loop?: boolean;
}

export interface EndEvent extends ISequenceEvent {}

export type SequenceEvent = TextEvent | ImageEvent | AudioEvent | EndEvent;
