import { Create } from "../../../core/types/Create";
import { Channel } from "../types/Channel";

export const default_channel: Create<Channel> = (obj) => ({
  $type: "channel",
  $name: "$default",
  loop: false,
  ...obj,
});
