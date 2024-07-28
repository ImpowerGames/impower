import { Animation } from "./Animation";

export type ElementContent =
  | TextContent
  | StyleContent
  | FontContent
  | AnimationContent;

export interface TextContent {
  text: string;
}

export interface StyleContent {
  style: Record<string, any>;
}

export interface FontContent {
  fonts: Record<string, any>;
}

export interface AnimationContent {
  animations: Record<string, Animation>;
}
