export const navNextKey = (
  dir: "row" | "column" | "row-reverse" | "column-reverse" | null | undefined
): "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" => {
  if (dir === "row") {
    return "ArrowRight";
  }
  if (dir === "column") {
    return "ArrowDown";
  }
  if (dir === "row-reverse") {
    return "ArrowLeft";
  }
  if (dir === "column-reverse") {
    return "ArrowUp";
  }
  return "ArrowDown";
};
