import { _font } from "./_font";

export const FONT_DEFAULTS = {
  default: _font({ $name: "default" }),
  roboto400: _font({
    $name: "roboto400",
    src: "local('Roboto'), local('Roboto-Regular'), url(http://fonts.gstatic.com/s/roboto/v15/oMMgfZMQthOryQo9n22dcuvvDin1pK8aKteLpeZ5c0A.woff2) format('woff2')",
    weight: 400,
    style: "normal",
  }),
  roboto500: _font({
    $name: "roboto500",
    src: "local('Roboto Medium'), local('Roboto-Medium'), url(http://fonts.gstatic.com/s/roboto/v15/RxZJdnzeo3R5zSexge8UUZBw1xU1rKptJj_0jans920.woff2) format('woff2')",
    weight: 500,
    style: "normal",
  }),
};
