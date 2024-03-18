import encodeSVG from "./encodeSVG";
import filterSVG from "./filterSVG";

const buildSVGSource = (
  svg: string,
  filter?: {
    includes?: string[] | undefined;
    excludes?: string[] | undefined;
  }
) => {
  const mime = "image/svg+xml";
  const filteredText = filter ? filterSVG(svg, filter) : svg;
  const data = encodeSVG(filteredText);
  const src = `data:${mime},${data}`;
  return src;
};

export default buildSVGSource;
