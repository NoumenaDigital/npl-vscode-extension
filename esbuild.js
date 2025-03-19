const { build, context } = require('esbuild');
const { copyFile } = require('fs/promises');
const { glob } = require('glob');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  target: 'es2022',
  outfile: './dist/extension.js',
  format: 'cjs',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

// Building the extension
(async () => {
  try {
    if (watch) {
      // Watch mode
      const ctx = await context({
        ...options,
        plugins: [{
          name: 'watch-plugin',
          setup(build) {
            build.onEnd(result => {
              if (result.errors.length > 0) {
                console.error('Watch build failed:', result.errors);
              } else {
                console.log('Watch build succeeded:', new Date().toLocaleTimeString());
              }
            });
          },
        }],
      });

      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      // Build once
      await build(options);
      console.log('Build complete');
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
