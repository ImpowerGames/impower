/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-undef */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
"use strict";

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");

/** @type WebpackConfig */
const webExtensionConfig = {
  mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: "webworker",
  node: {
    __dirname: true,
  },
  entry: {
    extension: "./src/extension.ts",
  },
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "./out"),
    libraryTarget: "commonjs",
    devtoolModuleFilenameTemplate: "../../[resource-path]",
  },
  resolve: {
    mainFields: ["browser", "module", "main"], // look for `browser` entry point in imported node modules
    extensions: [".ts", ".js"], // support ts-files and js-files
    alias: {
      // provides alternate implementation for node module and source files
      "iconv-lite": false,
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
      child_process: false,
      crypto: false,
      fs: false,
      buffer: require.resolve("buffer/"),
      os: require.resolve("os-browserify/browser"),
      path: require.resolve("path-browserify"),
      stream: require.resolve("stream-browserify"),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "esbuild-loader",
        options: {
          target: "es2020",
        },
      },
      // bundle and load afm font files verbatim
      { test: /\.afm$/, type: "asset/source" },
      // bundle and load ttf font files as base64
      {
        test: /\.ttf$/,
        type: "asset/inline",
      },
      // convert to base64 and include inline file system binary files used by fontkit and linebreak
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
    ],
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1, // disable chunks by default since web extensions must be a single bundle
    }),
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser", // provide a shim for the global `process` variable
    }),
    new CopyPlugin({
      patterns: [
        { from: "data", to: "data" },
        { from: "node_modules/@vscode/codicons/dist", to: "data" },
        {
          from: "node_modules/@impower/sparkdown-language-server/dist",
          to: "workers",
        },
        {
          from: "node_modules/@impower/sparkdown-screenplay-pdf/dist",
          to: "workers",
        },
      ],
    }),
  ],
  externals: {
    vscode: "commonjs vscode",
  },
  performance: {
    hints: false,
  },
  devtool: "nosources-source-map", // create a source map that points to the original source file
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

module.exports = [webExtensionConfig];
