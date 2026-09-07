// `mdn-data` ships JSON data with no type declarations. The generator reads
// only the CSS property table, so that is all this describes.

declare module "mdn-data" {
  interface MdnCssProperty {
    syntax?: string;
    media?: string;
    inherited?: boolean;
    animationType?: string;
    percentages?: string;
    groups?: string[];
    initial?: string | string[];
    appliesto?: string;
    computed?: string | string[];
    order?: string;
    status?: string;
    mdn_url?: string;
  }

  const data: {
    css: {
      properties: Record<string, MdnCssProperty>;
      [key: string]: Record<string, unknown>;
    };
    [key: string]: unknown;
  };

  export default data;
}
