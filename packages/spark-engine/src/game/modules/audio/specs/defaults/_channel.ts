import { Create } from "../../../../core/types/Create";
import { Channel } from "../Channel";

export const _channel: Create<Channel> = (obj) => ({
  loop: false,
  fadein: 0,
  fadeout: 0,
  ...obj,
});
