import { Create } from "../../types/Create";
import { Font } from "../../types/Font";

export const _font: Create<Font> = (obj) => ({
  $type: "font",
  src: "url(http://fonts.gstatic.com/s/roboto/v15/oMMgfZMQthOryQo9n22dcuvvDin1pK8aKteLpeZ5c0A.woff2)",
  weight: 400,
  style: "normal",
  ...obj,
});
