import { useEffect } from "react";
import { setHTMLBackgroundColor } from "../utils/setHTMLBackgroundColor";

const useHTMLBackgroundColor = (backgroundColor: string): void => {
  useEffect(() => {
    setHTMLBackgroundColor(document, backgroundColor);
  }, [backgroundColor]);
};

export default useHTMLBackgroundColor;
