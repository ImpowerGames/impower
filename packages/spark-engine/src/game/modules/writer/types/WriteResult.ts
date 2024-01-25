import {
  AudioEvent,
  ButtonEvent,
  ImageEvent,
  TextEvent,
} from "../../../core/types/SequenceEvent";

export interface WriteResult {
  button: Record<string, ButtonEvent[]>;
  text: Record<string, TextEvent[]>;
  image: Record<string, ImageEvent[]>;
  audio: Record<string, AudioEvent[]>;
  end: number;
}
