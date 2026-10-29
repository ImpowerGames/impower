// @ts-expect-error the probe assigns a string to a number
export const probe: number = "";
// workaround(node): fs.watch fires twice for one change on Windows in Node 24, https://github.com/nodejs/node/issues/47058
export const after = 2;
