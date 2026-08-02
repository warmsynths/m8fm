import { defineConfig, Plugin } from 'vite';

function patchM8JsPlugin(): Plugin {
  return {
    name: 'patch-m8-js-plugin',
    transform(code: string, id: string) {
      if (id.includes('m8-js')) {
        return {
          code: code.replace(/class\s+([A-Za-z0-9_]+)(\s+extends\s+[^{]+)?\s*\{/g, (_match, className, extendsClause) => {
            return `class ${className}${extendsClause || ''} {\n  static name = '${className}';`;
          }),
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [patchM8JsPlugin()],
  build: {
    outDir: 'docs',
  },
});

