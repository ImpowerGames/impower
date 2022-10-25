/* eslint-disable */

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const webpack = require("webpack");

module.exports = withBundleAnalyzer({
  experimental: {
    externalDir: true,
  },
  compiler: { emotion: true },
  pwa: {
    disable: process.env.NODE_ENV === "development",
    dest: "public",
    register: false,
    skipWaiting: false,
  },
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.(svg)$/,
      use: ["@svgr/webpack"],
    });
    config.module.rules.push({
      test: /\.md$/,
      loader: "raw-loader",
    });
    if (
      !isServer &&
      config.optimization.splitChunks.cacheGroups &&
      config.optimization.splitChunks.cacheGroups.commons
    ) {
      config.optimization.splitChunks.cacheGroups.commons.minChunks = 60;
    }
    config.plugins = [
      ...(config.plugins || []),
      new webpack.ProvidePlugin({
        PIXI: "pixi.js",
      }),
    ];
    return config;
  },
  redirects: async () => {
    return [
      {
        source: "/p",
        destination: "/pitch",
        permanent: true,
      },
      {
        source: "/g",
        destination: "/games",
        permanent: true,
      },
      {
        source: "/r",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/e",
        destination: "/engine",
        permanent: true,
      },
    ];
  },
});
