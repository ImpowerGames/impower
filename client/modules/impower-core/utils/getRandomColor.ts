import randomcolor from "randomcolor";

export type Luminosity = "random" | "light" | "dark" | "bright";

interface RandomColorOptions {
  luminosity?: Luminosity;
  hue?: string;
  count?: number;
  seed?: number | string;
  format?: "rgb" | "rgba" | "rgbArray" | "hsl" | "hsla" | "hslArray" | "hex";
  alpha?: number;
}

const defaultOptions: RandomColorOptions = {
  luminosity: "light",
  format: "hex",
};

const getRandomColor = (
  options: RandomColorOptions = defaultOptions
): string => {
  return randomcolor({ ...defaultOptions, ...options });
};

export default getRandomColor;
