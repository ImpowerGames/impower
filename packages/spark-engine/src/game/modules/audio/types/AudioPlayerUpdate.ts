export interface AudioPlayerUpdate {
  control: "start" | "stop" | "modulate" | "await";
  key?: string;
  after?: number;
  over?: number;
  fadeto?: number;
  now?: boolean;
  loop?: boolean;
}
