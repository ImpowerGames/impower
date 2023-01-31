export const getCSSCornerKey = (shape: "round" | "cut") => {
  return shape === "cut" ? "clip-path" : "border-radius";
};
