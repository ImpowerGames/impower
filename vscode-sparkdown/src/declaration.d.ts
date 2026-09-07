// esbuild inlines these as strings through the repo's loader plugin. The `?tw`
// and `?raw` suffixes select a loader; they still resolve to a string.

declare module "*.css" {
  const value: string;
  export default value;
}

declare module "*.css?raw" {
  const value: string;
  export default value;
}

declare module "*.css?tw" {
  const value: string;
  export default value;
}

declare module "*.html" {
  const value: string;
  export default value;
}

declare module "*.txt" {
  const value: string;
  export default value;
}
