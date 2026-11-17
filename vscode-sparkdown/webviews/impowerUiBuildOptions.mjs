/** @type {import('esbuild').BuildOptions} **/
export const impowerUiBuildOptions = {
  conditions: ["development"],
  jsx: "automatic",
  jsxImportSource: "preact",
  alias: {
    react: "preact/compat",
    "react-dom": "preact/compat",
  },
};
