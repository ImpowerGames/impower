export interface ElementState {
  type: string;
  name?: string;
  text?: string;
  style?: Record<string, string | null>;
  attributes?: Record<string, string | null>;
}
