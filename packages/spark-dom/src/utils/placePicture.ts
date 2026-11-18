export interface PictureFramingValues {
  x: number;
  y: number;
  zoom: number;
}

const decimal = (value: number) => String(Number(value.toFixed(6)));

const axis = (at: number, zoom: number, extent: "cqw" | "cqh") => {
  const layer = Number((at * 100).toFixed(6));
  const own = Number(((0.5 + zoom * (at - 0.5)) * 100).toFixed(6));
  const terms = [
    ...(layer === 0 ? [] : [{ value: layer, unit: extent }]),
    ...(own === 0 ? [] : [{ value: -own, unit: "%" }]),
  ];
  if (terms.length === 0) {
    return "0px";
  }
  if (terms.length === 1) {
    return `${decimal(terms[0]!.value)}${terms[0]!.unit}`;
  }
  const [first, second] = terms as [{ value: number; unit: string }, { value: number; unit: string }];
  const sign = second.value < 0 ? "-" : "+";
  return `calc(${decimal(first.value)}${first.unit} ${sign} ${decimal(Math.abs(second.value))}${second.unit})`;
};

export const getPicturePlacement = (
  framing: PictureFramingValues | undefined,
): { translate: string | null; scale: string | null } => {
  if (!framing) {
    return { translate: null, scale: null };
  }
  return {
    translate: `${axis(framing.x, framing.zoom, "cqw")} ${axis(framing.y, framing.zoom, "cqh")}`,
    scale: framing.zoom === 1 ? null : decimal(framing.zoom),
  };
};

export const placePicture = (
  el: HTMLElement,
  framing: PictureFramingValues | undefined,
) => {
  el.classList.toggle("framed", Boolean(framing));
  for (const [property, value] of Object.entries(getPicturePlacement(framing))) {
    if (value == null) {
      el.style.removeProperty(property);
    } else {
      el.style.setProperty(property, value);
    }
  }
};
