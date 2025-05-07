const webpack = require('webpack');
const { defineConfig } = require('@vue/cli-service');

module.exports = defineConfig({
    transpileDependencies: true,
    configureWebpack: {
        resolve: {
            fallback: {
                "crypto": require.resolve("crypto-browserify"),
                "stream": require.resolve("stream-browserify"),
                "vm": require.resolve("vm-browserify"),
                "buffer": require.resolve("buffer/"),
                "util": require.resolve("util/")
            }
        },
        plugins: [
            new webpack.ProvidePlugin({
                process: 'process/browser',
                Buffer: ['buffer', 'Buffer']
            }),
            new webpack.DefinePlugin({
                __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
            })
        ],
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env'],
                            plugins: [
                                '@babel/plugin-transform-modules-commonjs',
                                '@babel/plugin-transform-runtime'
                            ]
                        }
                    }
                }
            ]
        }
    },
    chainWebpack: config => {
        config.plugin('define').tap(definitions => {
        definitions[0] = {
            ...definitions[0],
            __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
        };
        return definitions;
        });
    }
});