export interface AudioPlayerUpdate {
  control: "start" | "stop" | "fade" | "await";
  key?: string;
  after?: number;
  over?: number;
  fadeto?: number;
  at?: number;
  now?: boolean;
  loop?: boolean;
}
