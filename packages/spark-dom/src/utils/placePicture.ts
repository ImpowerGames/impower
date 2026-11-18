export interface PictureFramingValues {
  x: number;
  y: number;
  zoom: number;
}

const decimal = (value: number) => String(Number(value.toFixed(6)));

const axis = (offset: number, zoom: number, extent: "cqw" | "cqh") =>
  offset === 0
    ? "0px"
    : `calc(${decimal(offset)} * (100${extent} - ${decimal(zoom * 100)}%))`;

export const getPicturePlacement = (
  framing: PictureFramingValues | undefined,
): { translate: string | null; scale: string | null } => {
  if (!framing) {
    return { translate: null, scale: null };
  }
  const x = axis(framing.x - 0.5, framing.zoom, "cqw");
  const y = axis(framing.y - 0.5, framing.zoom, "cqh");
  return {
    translate: x === "0px" && y === "0px" ? null : `${x} ${y}`,
    scale: framing.zoom === 1 ? null : decimal(framing.zoom),
  };
};

export const placePicture = (
  el: HTMLElement,
  framing: PictureFramingValues | undefined,
) => {
  for (const [property, value] of Object.entries(getPicturePlacement(framing))) {
    if (value == null) {
      el.style.removeProperty(property);
    } else {
      el.style.setProperty(property, value);
    }
  }
};
