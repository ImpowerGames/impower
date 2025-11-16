export interface AudioPlayerUpdate {
  control: "start" | "stop" | "fade" | "await";
  key?: string;
  after?: number;
  over?: number;
  to?: number;
  at?: number;
  now?: boolean;
  loop?: boolean;
}
