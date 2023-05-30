import { useEffect, useState } from "react";
import { isMobile } from "../utils/isMobile";

const useMobile = (): boolean => {
  const [state, setState] = useState<boolean>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setState(isMobile());
  });

  return state;
};

export default useMobile;
