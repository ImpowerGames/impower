import { useEffect } from "react";

const useThemeColor = (backgroundColor: string): void => {
  useEffect(() => {
    const metaThemeColor = document.querySelector("meta[name=theme-color]");
    metaThemeColor.setAttribute("content", backgroundColor);
  }, [backgroundColor]);
};

export default useThemeColor;
