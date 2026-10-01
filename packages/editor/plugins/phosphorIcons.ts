/**
 * Dev-server plugin that loads each Phosphor icon from its own file. `@phosphor-icons/vue` exposes
 * only its barrel, which Vite pre-bundles with all ~1,500 icons: 7 MB of JavaScript, three times
 * that with the source map inlined, for the browser to fetch and compile on every start while the
 * app draws about twenty. This rewrites `import { PhGear, PhCheck as Ok } from '@phosphor-icons/vue'`
 * in the editor's and the engine's sources into one import per icon file, keeping the line count so
 * source maps still line up. Builds tree-shake the barrel and are left alone.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { normalizePath, type Plugin } from 'vite';

const PACKAGE = '@phosphor-icons/vue';
// Anchored at a line's start so text in strings and comments is left alone.
const NAMED_IMPORT = /^([ \t]*)import\s*\{([^}]*)\}\s*from\s*(['"])@phosphor-icons\/vue\3;?/gm;

/** The package's folder of one-file-per-icon modules, `PhGear.vue.mjs` and so on. */
export function phosphorIconsDir (): string {
  const entry = createRequire(import.meta.url).resolve(PACKAGE);
  return path.join(path.dirname(entry), 'icons');
}

/**
 * `code` with each named import from the package pointed at the icons' own files, or null when
 * nothing changes. An import is left as it is when one of its names has no file of its own (a type,
 * or anything that is not an icon), so it still resolves through the barrel.
 */
export function rewriteIconImports (code: string, iconsDir: string, exists: (file: string) => boolean = existsSync): string | null {
  if (!code.includes(PACKAGE)) return null;
  let changed = false;
  const out = code.replace(NAMED_IMPORT, (whole, indent: string, names: string) => {
    const specs = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [name, local = name] = s.split(/\s+as\s+/);
      return {
        name,
        local,
        file: normalizePath(path.join(iconsDir, `${name}.vue.mjs`)),
      };
    });
    if (!specs.length || specs.some((s) => /\s/.test(s.name) || !exists(s.file))) return whole;
    changed = true;
    const lines = whole.split('\n').length;
    return indent + specs.map((s) => `import ${s.local} from ${JSON.stringify(s.file)};`).join(' ') + '\n'.repeat(lines - 1);
  });
  return changed ? out : null;
}

export function phosphorIcons (): Plugin {
  let iconsDir = '';
  return {
    name: 'phosphor-icons-per-file',
    apply: 'serve',
    configResolved () {
      iconsDir = phosphorIconsDir();
    },
    transform (code, id) {
      if (id.includes('/node_modules/')) return null;
      const out = rewriteIconImports(code, iconsDir);
      return out === null ? null : { code: out, map: null };
    },
  };
}
