import { type Create } from "../../../core/types/Create";
import { type Channel } from "../types/Channel";

export const default_channel: Create<Channel> = (obj) => ({
  $type: "channel",
  $name: "$default",
  mixer: { $type: "mixer", $name: "none" },
  loop: false,
  play_behavior: "replace",
  ...obj,
});
