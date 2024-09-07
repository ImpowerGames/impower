import { ElementContent } from "./ElementContent";

export interface ElementState {
  type?: string;
  name?: string;
  content?: ElementContent;
  style?: Record<string, string | null> | null;
  attributes?: Record<string, string | null> | null;
  persistent?: boolean;
}
