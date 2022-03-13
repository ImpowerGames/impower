import { useEffect } from "react";
import { setHTMLOverscrollBehavior } from "../utils/setHTMLOverscrollBehavior";

const useHTMLOverscrollBehavior = (
  overscrollBehavior: "auto" | "contain"
): void => {
  useEffect(() => {
    setHTMLOverscrollBehavior(document, overscrollBehavior);
  }, [overscrollBehavior]);
};

export default useHTMLOverscrollBehavior;
