export interface ImageEvent {
  enter?: number;
  exit?: number;

  image?: string[];
  params?: Record<string, string | null>;
}
