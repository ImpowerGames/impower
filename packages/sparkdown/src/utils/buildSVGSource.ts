const buildSVGSource = (svg: string) => {
  const mime = "image/svg+xml";
  const encoded = encodeURIComponent(svg);
  const src = `data:${mime},${encoded}`;
  return src;
};

export default buildSVGSource;
