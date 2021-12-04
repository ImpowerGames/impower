import { useCallback, useMemo, useRef, useState } from "react";
import ConfigCache from "../classes/configCache";
import { ConfigContextState } from "../types/configContextState";
import { ConfigParameters } from "../types/interfaces/configParameters";

export const useConfigContextState = (): ConfigContextState => {
  const stateRef = useRef<ConfigParameters>();
  const [state, setState] = useState<ConfigParameters>();
  const handleFetchConfig = useCallback(async (): Promise<ConfigParameters> => {
    if (!ConfigCache.instance?.params?.phrases) {
      setState(stateRef.current);
      if (typeof window !== "undefined") {
        const Config = (await import("../classes/config")).default;
        stateRef.current = Config.instance.hydrate();
        ConfigCache.instance.set(stateRef.current);
        setState(stateRef.current);
        await Config.instance.fetchAndActivate();
        stateRef.current = Config.instance.hydrate();
        ConfigCache.instance.set(stateRef.current);
        setState(stateRef.current);
      }
    }
    return stateRef.current;
  }, []);
  return useMemo(() => [state, handleFetchConfig], [handleFetchConfig, state]);
};
