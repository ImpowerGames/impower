//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/** @type BuildOptions */
module.exports = {
  loader: {
    ".html": "text",
    ".css": "text",
    ".svg": "text",
  },
};
