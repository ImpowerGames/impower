import encodeSVG from "./encodeSVG";
import filterSVG from "./filterSVG";

const buildSVGSource = (
  svg: string,
  filter?: {
    includes?: string[] | undefined;
    excludes?: string[] | undefined;
  },
  filterTag = "filter",
  defaultTag = "default"
) => {
  const mime = "image/svg+xml";
  const filteredText = filter
    ? filterSVG(svg, filter, filterTag, defaultTag)
    : svg;
  const encoded = encodeSVG(filteredText);
  const src = `data:${mime},${encoded}`;
  return src;
};

export default buildSVGSource;
