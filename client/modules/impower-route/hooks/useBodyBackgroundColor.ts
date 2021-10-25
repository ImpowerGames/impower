import { useEffect } from "react";
import { setBodyBackgroundColor } from "../utils/setBodyBackgroundColor";

const useBodyBackgroundColor = (backgroundColor: string): void => {
  useEffect(() => {
    setBodyBackgroundColor(document, backgroundColor);
  }, [backgroundColor]);
};

export default useBodyBackgroundColor;
