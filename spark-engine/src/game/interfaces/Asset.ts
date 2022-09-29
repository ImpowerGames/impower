export interface Asset {
  from: number;
  to: number;
  line: number;
  name: string;
  type: "image" | "audio" | "video" | "text";
  value: string;
}
