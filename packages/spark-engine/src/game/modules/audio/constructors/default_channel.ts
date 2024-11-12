import { Create } from "../../../core/types/Create";
import { Channel } from "../types/Channel";

export const default_channel: Create<Channel> = (obj) => ({
  $type: "channel",
  $name: "$default",
  mixer: { $type: "mixer", $name: "none" },
  loop: false,
  ...obj,
});
