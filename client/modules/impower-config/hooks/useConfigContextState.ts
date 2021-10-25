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
        if (process.env.NEXT_PUBLIC_ORIGIN.includes("localhost")) {
          // Fetch then activate latest values
          // (This may cause things in the interface to change suddenly after the fetch is done
          // but this behavior should be ok in a dev environment)
          await Config.instance.fetchAndActivate();
        } else {
          // Activate values that were fetched during last app startup.
          // And then fetch and cache new values for next startup.
          // (This prevents the interface from changing around suddenly after the fetch is done)
          await Config.instance.activateThenFetch();
        }
        stateRef.current = Config.instance.hydrate();
        setState(stateRef.current);
      }
    }
    return stateRef.current;
  }, []);
  return useMemo(() => [state, handleFetchConfig], [handleFetchConfig, state]);
};
