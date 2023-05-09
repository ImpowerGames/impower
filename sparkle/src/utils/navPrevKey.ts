export const navPrevKey = (
  dir: "row" | "column" | "row-reverse" | "column-reverse" | null | undefined
): "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" => {
  if (dir === "row") {
    return "ArrowLeft";
  }
  if (dir === "column") {
    return "ArrowUp";
  }
  if (dir === "row-reverse") {
    return "ArrowRight";
  }
  if (dir === "column-reverse") {
    return "ArrowDown";
  }
  return "ArrowUp";
};
