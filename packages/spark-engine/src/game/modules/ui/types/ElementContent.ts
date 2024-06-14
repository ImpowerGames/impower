export type ElementContent = TextContent | StyleContent | FontContent;

export interface TextContent {
  text: string;
}

export interface StyleContent {
  style: Record<string, any>;
}

export interface FontContent {
  fonts: Record<string, any>;
}
