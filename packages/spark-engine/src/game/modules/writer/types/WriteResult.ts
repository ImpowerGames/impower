import {
  AudioEvent,
  ImageEvent,
  TextEvent,
} from "../../../core/types/SequenceEvent";

export interface WriteResult {
  text: Record<string, TextEvent[]>;
  image: Record<string, ImageEvent[]>;
  audio: Record<string, AudioEvent[]>;
  end: number;
}
