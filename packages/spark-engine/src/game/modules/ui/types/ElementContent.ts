export type ElementContent =
  | ImportContent
  | AnimationContent
  | StyleContent
  | TextContent;

export interface TextContent {
  text: string;
}

export interface ImportContent {
  import: Record<string, any>;
}

export interface AnimationContent {
  animation: Record<string, any>;
}

export interface StyleContent {
  style: Record<string, any>;
}
