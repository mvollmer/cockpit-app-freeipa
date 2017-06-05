var copy = require("copy-webpack-plugin");
var extract = require("extract-text-webpack-plugin");

module.exports = {
    entry: "./freeipa.jsx",
    resolve: {
        modules: [ "node_modules" ]
    },
    externals: [
        "cockpit"
    ],
    output: {
        filename: 'dist/freeipa.js'
    },
    plugins: [
        new extract("dist/freeipa.css"),
        new copy(
            [
                { from: "index.html", to: "dist/" },
                { from: "manifest.json", to: "dist/" }
            ]
        )
    ],
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                enforce: 'pre',
                loader: 'eslint-loader'
            },
            {
                test: /\.(js|jsx)$/,
                loader: 'babel-loader',
                options:
                {
                    presets: ['es2015', 'react']
                }
            },
            {
                test: /\.css$/,
                loader: extract.extract("css-loader")
            }
        ]
    }
};
