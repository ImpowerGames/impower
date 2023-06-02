export enum Alignment {
  Auto = "Auto",
  Center = "Center",
  End = "End",
  Start = "Start",
}

export enum Direction {
  Horizontal = "Horizontal",
  Vertical = "Vertical",
}

export enum ScrollChangeReason {
  Observed = "Observed",
  Requested = "Requested",
}

export const windowScrollProp: {
  [direction in Direction]: "pageOffsetY" | "pageOffsetX";
} = {
  Vertical: "pageOffsetY",
  Horizontal: "pageOffsetX",
};

export const elementScrollProp: {
  [direction in Direction]: "scrollTop" | "scrollLeft";
} = {
  Vertical: "scrollTop",
  Horizontal: "scrollLeft",
};

export const sizeProp: {
  [direction in Direction]: "minHeight" | "minWidth";
} = {
  Vertical: "minHeight",
  Horizontal: "minWidth",
};

export const insetProp: { [direction in Direction]: "top" | "left" } = {
  Vertical: "top",
  Horizontal: "left",
};

export const transformProp: {
  [direction in Direction]: "translateY" | "translateX";
} = {
  Vertical: "translateY",
  Horizontal: "translateX",
};

export type ItemSizeGetter = (index: number) => number;
export type ItemSize = number | number[] | ItemSizeGetter;
