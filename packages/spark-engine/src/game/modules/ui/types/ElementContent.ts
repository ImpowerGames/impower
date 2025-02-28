import { Animation } from "./Animation";
import { Font } from "./Font";

export type ElementContent =
  | TextContent
  | StyleContent
  | FontContent
  | AnimationContent;

export interface TextContent {
  text: string;
}

export interface StyleContent {
  styles: Record<string, any>;
}

export interface FontContent {
  fonts: Record<string, Font>;
}

export interface AnimationContent {
  animations: Record<string, Animation>;
}
