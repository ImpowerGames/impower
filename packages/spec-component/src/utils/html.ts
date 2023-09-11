import sanitize from "./sanitize";

const html = (
  raw: readonly string[] | ArrayLike<string>,
  ...substitutions: (false | number | string | (() => string))[]
) =>
  String.raw(
    { raw },
    ...substitutions.map((s) =>
      s == null || s === false
        ? ""
        : typeof s === "number"
        ? String(s)
        : typeof s === "function"
        ? s()
        : sanitize(s)
    )
  );

export default html;
