const BLOCK_COMMENT_REGEX = /\/\*[\s\S]*?\*\/|\/\/.*/g;

const stripBlockComments = (str: string): string => {
  return str.replace(BLOCK_COMMENT_REGEX, "");
};

export default stripBlockComments;
