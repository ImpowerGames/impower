const INLINE_COMMENT_REGEX = /([%][%][ \t]+)(.*)$/gm;

// TODO: make compiler ignore comments, so we don't need to strip them out ahead of time, and so that the diagnostics can report the correct `from` and `to` values even if the expression contains comments.
const stripInlineComments = (str: string): string => {
  return str.replace(INLINE_COMMENT_REGEX, "");
};

export default stripInlineComments;
