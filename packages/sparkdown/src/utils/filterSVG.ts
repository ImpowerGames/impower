import { filterMatchesName } from "./filterMatchesName";

const ID_ATTRIBUTE_REGEX = /(\bid)(\s*)(=)(\s*)(["'])((?:[^"'\\]|\\.)*)(\5)/g;

export const filterSVG = (
  svg: string,
  filter: { includes: unknown[]; excludes: unknown[] },
  filterableTag = "filter",
  defaultTag = "default"
) => {
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
      if (filterMatchesName(id, filter, filterableTag, defaultTag)) {
        return `${$0} display=${quote}none${quote}`;
      }
      return $0;
    }
  );
  return result;
};
