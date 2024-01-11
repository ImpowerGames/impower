export interface ISequenceEvent {
  params?: Record<string, unknown | null>;

  enter?: number;
  exit?: number;
}

export interface ButtonEvent extends ISequenceEvent {
  instance: number;
  button: string;

  enter?: number;
  exit?: number;
}

export interface TextEvent extends ISequenceEvent {
  instance?: number;
  text: string;
  params?: {
    position?: string;
    "text-decoration"?: string;
    "font-style"?: string;
    "font-weight"?: string;
    "text-align"?: string;
    "white-space"?: string;
    "background-color"?: string;
    animation?: string;
    "animation-delay"?: string;
    "transition-duration"?: string;
  };

  enter?: number;
  exit?: number;
}

export interface ImageEvent extends ISequenceEvent {
  instance?: number;
  image: string[];
  params?: {
    "transition-duration"?: string;
  };

  enter?: number;
  exit?: number;
}

export interface AudioEvent extends ISequenceEvent {
  instance?: number;
  audio: string[];
  params?: {
    start?: true;
    stop?: true;
    schedule?: true;
    loop?: true;
    noloop?: true;
    mute?: true;
    unmute?: true;
    volume?: number;
    after?: number;
    over?: number;
  };

  enter?: number;
  exit?: number;
}

export interface SynthEvent extends ISequenceEvent {
  instance?: number;
  synth: string[];
  params?: {
    pitch?: number;
    duration?: number;
  };

  enter?: number;
  exit?: number;
}

export interface EndEvent extends ISequenceEvent {
  enter?: number;
}

export type SequenceEvent =
  | TextEvent
  | ImageEvent
  | AudioEvent
  | SynthEvent
  | EndEvent;
