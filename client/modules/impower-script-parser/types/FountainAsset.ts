export interface FountainAsset {
  start: number;
  line: number;
  type: "image" | "audio" | "video" | "text";
  value: string;
}
