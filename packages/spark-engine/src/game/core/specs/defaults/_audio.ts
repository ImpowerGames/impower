import { Create } from "../../types/Create";
import { Audio } from "../Audio";

export const _audio: Create<Audio> = (obj) => ({
  type: "audio",
  src: "",
  volume: 1,
  loop: false,
  cues: [],
  ...(obj || {}),
});
