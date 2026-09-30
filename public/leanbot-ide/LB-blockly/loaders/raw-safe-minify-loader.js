const { minify } = require("terser");

module.exports = async function rawSafeMinifyLoader(source) {
  const callback = this.async();
  const sourceText = source.toString();
  const isProd = this.mode === "production" || process.env.NODE_ENV === "production";

  if (!isProd) {
    callback(null, `module.exports = ${JSON.stringify(sourceText)};`);
    return;
  }

  try {
    const result = await minify(sourceText, {
      compress: {
        defaults: true,
        passes: 2,
      },
      // Keep public/global symbol names stable for legacy scripts.
      mangle: false,
      format: {
        comments: false,
      },
    });

    callback(null, `module.exports = ${JSON.stringify(result.code || "")};`);
  } catch (error) {
    callback(error);
  }
};
