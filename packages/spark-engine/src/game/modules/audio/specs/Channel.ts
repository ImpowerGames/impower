import { Mixer } from "./Mixer";

export interface Channel {
  mixer?: Mixer;
  loop: boolean;
  fadein: number;
  fadeout: number;
}
