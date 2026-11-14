import { type Animation } from "./Animation";

export type ElementContent =
  | TextContent
  | StyleContent
  | AnimationContent;

export interface TextContent {
  text: string;
}

export interface StyleContent {
  styles: Record<string, any>;
}

export interface AnimationContent {
  animations: Record<string, Animation>;
}
