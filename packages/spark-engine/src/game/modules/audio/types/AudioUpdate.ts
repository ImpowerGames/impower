export interface AudioUpdate {
  id: string;
  name: string;
  channel: string;
  playing: boolean;
  looping: boolean;
  scheduled: boolean;
  volume: number;
  after: number;
  over: number;
  cues?: number[];
}
