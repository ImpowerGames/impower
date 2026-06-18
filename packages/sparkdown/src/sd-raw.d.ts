// A `?raw` import returns the file's raw text as a string. Vite and vitest
// support this natively; the repo's esbuild bundles (LS worker, player inline
// worker, vscode) add a matching `?raw` plugin — see the commit
// "build: support Vite's ?raw import convention in esbuild bundles".
declare module "*.sd?raw" {
  const content: string;
  export default content;
}
