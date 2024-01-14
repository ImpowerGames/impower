import { TextState } from "./TextState";

export interface TextEvent extends TextState {
  enter?: number;
  exit?: number;
}
