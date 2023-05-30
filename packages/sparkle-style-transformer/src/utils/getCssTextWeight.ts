const getCssTextWeight = (value: string): string => {
  if (value === "thin") {
    return "100";
  }
  if (value === "extralight") {
    return "200";
  }
  if (value === "light") {
    return "300";
  }
  if (value === "normal") {
    return "400";
  }
  if (value === "medium") {
    return "500";
  }
  if (value === "semibold") {
    return "600";
  }
  if (value === "bold") {
    return "700";
  }
  if (value === "extrabold") {
    return "800";
  }
  if (value === "black") {
    return "900";
  }
  return value;
};

export default getCssTextWeight;
