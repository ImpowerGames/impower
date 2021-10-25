import { useEffect, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

const getWindowSize = (): Size => {
  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
};

export const useResize = (): Size => {
  const [size, setSize] = useState<{ height: number; width: number }>();

  useEffect(() => {
    if (!size) {
      setSize(getWindowSize());
    }

    const handleResize = (): void => {
      setSize(getWindowSize());
    };

    window.addEventListener("resize", handleResize, {
      passive: true,
    });
    return (): void => window.removeEventListener("resize", handleResize);
  }, [setSize]); // eslint-disable-line react-hooks/exhaustive-deps

  return size;
};
