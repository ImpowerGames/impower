import createCache from "@emotion/cache";
import { EmotionCache } from "@emotion/react";

const createEmotionCache = (): EmotionCache => {
  return createCache({ key: "css", prepend: true });
};

export default createEmotionCache;
