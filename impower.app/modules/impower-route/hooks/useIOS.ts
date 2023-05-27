import { useEffect, useState } from "react";
import { isIOS } from "../utils/isIOS";

const useIOS = (): boolean => {
  const [state, setState] = useState<boolean>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setState(isIOS());
  });

  return state;
};

export default useIOS;
