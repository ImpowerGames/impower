import { useEffect, useState } from "preact/hooks";
import type { MediaState } from "../layout/media";

export function useMediaState<T extends string>(state: MediaState<T>): T {
  const [value, setValue] = useState(state.current);

  useEffect(() => {
    setValue(state.current());
    return state.subscribe(setValue);
  }, [state]);

  return value;
}
