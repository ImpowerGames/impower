export const getWorkerUrl = (name: string, buildId: string | undefined) =>
  buildId ? `/${name}.${buildId}.js` : `/${name}.js`;
