import { useCallback, useMemo, useRef, useState } from "react";
import { ConfigContextState } from "../types/configContextState";
import { ConfigParameters } from "../types/interfaces/configParameters";

export const useConfigContextState = (): ConfigContextState => {
  const fetchedRef = useRef(false);
  const stateRef = useRef<ConfigParameters>();
  const [state, setState] = useState<ConfigParameters>();
  const handleFetchConfig = useCallback(async (): Promise<ConfigParameters> => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      setState(stateRef.current);
      if (typeof window !== "undefined") {
        const Config = (await import("../classes/config")).default;
        stateRef.current = Config.instance.hydrate();
        setState(stateRef.current);
        await Config.instance.fetchAndActivate();
        stateRef.current = Config.instance.hydrate();
        setState(stateRef.current);
      }
    }
    return stateRef.current;
  }, []);
  return useMemo(() => [state, handleFetchConfig], [handleFetchConfig, state]);
};
