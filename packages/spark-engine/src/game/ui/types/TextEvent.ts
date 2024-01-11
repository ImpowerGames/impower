export interface TextEvent {
  enter?: number;
  exit?: number;

  text?: string;
  params?: Record<string, string | null>;
}
