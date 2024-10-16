const ID_ATTRIBUTE_REGEX = /(\bid)(\s*)(=)(\s*)(["'])((?:[^"'\\]|\\.)*)(\5)/g;

const idIncludesTag = (id: string, tag: string) =>
  new RegExp(`\\b${tag}\\b`).test(id);

const filterSVG = (
  svg: string,
  filter: { includes?: string[]; excludes?: string[] },
  filterTag = "filter",
  defaultTag = "default"
) => {
  const includes = [...(filter?.includes || [])];
  const excludes = [...(filter?.excludes || [])];
  if (defaultTag) {
    includes.unshift(defaultTag);
  }
  const result = svg.replace(
    ID_ATTRIBUTE_REGEX,
    (
      $0: string,
      _$1: string,
      _$2: string,
      _$3: string,
      _$4: string,
      $5: string,
      $6: string,
      _$7: string
    ): string => {
      const quote = $5;
      const id = $6;
      if (
        (!filterTag || idIncludesTag(id, filterTag)) &&
        (excludes.some((tag) => tag && idIncludesTag(id, tag)) ||
          includes.every((tag) => tag && !idIncludesTag(id, tag)))
      ) {
        return `${$0} display=${quote}none${quote}`;
      }
      return $0;
    }
  );
  return result;
};

export default filterSVG;
