module.exports = {
  presets: [
    ['@vue/cli-plugin-babel/preset', {
      useBuiltIns: 'entry',
      corejs: 3,
      modules: 'auto'
    }]
  ],
  plugins: [
    '@babel/plugin-transform-class-properties'
  ],
  sourceType: 'unambiguous'
};