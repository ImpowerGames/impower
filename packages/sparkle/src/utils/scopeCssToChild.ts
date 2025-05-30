const scopeCssToChild = (css: string) => css.replace(/(.+)([{])/g, `$1> * $2`);

export default scopeCssToChild;
