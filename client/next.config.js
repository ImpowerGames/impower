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
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
      }),
    ];
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "iconv-lite": false,
    };
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      buffer: require.resolve("buffer/"),
      stream: require.resolve("readable-stream"),
      zlib: require.resolve("browserify-zlib"),
    };
    config.module.generator["asset/resource"] =
      config.module.generator["asset"];
    config.module.generator["asset/source"] = config.module.generator["asset"];
    delete config.module.generator["asset"];
    config.module.rules = [
      ...(config.module.rules || []),
      {
        test: /\.(svg)$/,
        use: ["@svgr/webpack"],
      },
      {
        test: /\.md$/,
        loader: "raw-loader",
      },
      { test: /\.afm$/, type: "asset/source" },
      {
        test: /\.(ttf|woff2)$/,
        type: "asset/inline",
      },
      {
        enforce: "post",
        test: /fontkit[/\\]index.js$/,
        loader: "transform-loader",
        options: {
          brfs: {},
        },
      },
      {
        enforce: "post",
        test: /linebreak[/\\]src[/\\]linebreaker.js/,
        loader: "transform-loader",
        options: {
          brfs: {},
        },
      },
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
