const extractSVG = (value: string): string => {
  const start = "<svg ";
  const end = "</svg>";
  return value.slice(value.indexOf(start), value.lastIndexOf(end) + end.length);
};

export default extractSVG;
