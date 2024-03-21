const ID_ATTRIBUTE_REGEX = /(\bid)(\s*)(=)(\s*)(["'])((?:[^"'\\]|\\.)*)(\5)/g;

const idIncludesTag = (id: string, tag: string) =>
  new RegExp(`\\b${tag}\\b`).test(id);

const idStartsWithTag = (id: string, tag: string) =>
  new RegExp(`^${tag}\\b`).test(id);

const filterSVG = (
  svg: string,
  filter: { includes?: string[]; excludes?: string[] }
) => {
  const includes = filter?.includes || [];
  const excludes = filter?.excludes || [];
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
        idStartsWithTag(id, "filter") &&
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
