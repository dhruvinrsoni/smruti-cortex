const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    mode: isProd ? "production" : "development",
    devtool: isProd ? false : "eval-cheap-module-source-map",
    entry: {
      "background/service-worker": path.resolve(__dirname, "src/background/service-worker.ts"),
      "content_scripts/extractor": path.resolve(__dirname, "src/content_scripts/extractor.ts"),
      "popup/popup": path.resolve(__dirname, "src/popup/popup.ts")
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true
    },
    resolve: {
      extensions: [".ts", ".js"]
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "ts-loader",
              options: { transpileOnly: true }
            }
          ]
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader"]
        }
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: "manifest.json", to: "" },
          { from: "src/popup/popup.html", to: "popup/popup.html" },
          { from: "src/assets", to: "assets" }
        ]
      })
    ],
    optimization: {
      splitChunks: false
    }
  };
};