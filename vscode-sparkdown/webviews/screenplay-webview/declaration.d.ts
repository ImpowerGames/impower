// The repo's esbuild loader plugin inlines this stylesheet as a string; the
// `?tw` query selects the Tailwind pass.

declare module "*.css?tw" {
  const value: string;
  export default value;
}
