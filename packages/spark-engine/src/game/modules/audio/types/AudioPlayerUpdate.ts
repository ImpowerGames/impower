export interface AudioPlayerUpdate {
  control: "start" | "stop" | "modulate" | "await";
  channel: string;
  key?: string;
  after?: number;
  over?: number;
  fadeto?: number;
  now?: boolean;
  loop?: boolean;
}
