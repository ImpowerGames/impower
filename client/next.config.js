/* eslint-disable */

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const withPreact = require("next-plugin-preact");
const withPWA = require("next-pwa");

module.exports = withBundleAnalyzer(
  withPreact(
    withPWA({
      target: "serverless",
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
          loader: "emit-file-loader",
          options: {
            name: "dist/[path][name].[ext]",
          },
        });
        config.module.rules.push({
          test: /\.md$/,
          loader: "raw-loader",
        });
        if (!isServer && config.optimization.splitChunks.cacheGroups) {
          config.optimization.splitChunks.cacheGroups.commons.minChunks = 60;
        }
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
            destination: "/dashboard",
            permanent: true,
          },
        ];
      },
    })
  )
);
