export interface ISequenceEvent {
  params?: Record<string, unknown | null>;

  enter?: number;
  exit?: number;
  fade?: number;
}

export interface ButtonEvent extends ISequenceEvent {
  instance: number;
  button: string;
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
  };
}

export interface ImageEvent extends ISequenceEvent {
  instance?: number;
  image: string[];
  params?: {};
}

export interface AudioEvent extends ISequenceEvent {
  instance?: number;
  audio: string[];
  params?: {
    load?: boolean;
    unload?: boolean;
    start?: boolean;
    stop?: boolean;
    schedule?: boolean;
    loop?: boolean;
    noloop?: boolean;
    mute?: boolean;
    unmute?: boolean;
    volume?: number;
    after?: number;
    over?: number;
  };
}

export interface EndEvent extends ISequenceEvent {}

export type SequenceEvent = TextEvent | ImageEvent | AudioEvent | EndEvent;
