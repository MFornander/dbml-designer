import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { phosphorIconsDir, rewriteIconImports } from '../phosphorIcons';

const dir = '/icons';
const known = new Set(['PhGear', 'PhCheck', 'PhCaretDown'].map((n) => `${dir}/${n}.vue.mjs`));
const exists = (file: string): boolean => known.has(file);

describe('rewriteIconImports', () => {
  it('points each named icon at its own file, keeping local names', () => {
    const code = "import { ref } from 'vue';\nimport { PhGear, PhCheck as Ok } from '@phosphor-icons/vue';\nconst a = 1;\n";
    expect(rewriteIconImports(code, dir, exists)).toBe("import { ref } from 'vue';\nimport PhGear from \"/icons/PhGear.vue.mjs\"; import Ok from \"/icons/PhCheck.vue.mjs\";\nconst a = 1;\n");
  });

  it('keeps the line count of a multi-line import so source maps line up', () => {
    const code = 'import {\n  PhCaretDown,\n  PhCheck,\n} from "@phosphor-icons/vue";\nexport default 1;\n';
    const out = rewriteIconImports(code, dir, exists);
    expect(out).toBe('import PhCaretDown from "/icons/PhCaretDown.vue.mjs"; import PhCheck from "/icons/PhCheck.vue.mjs";\n\n\n\nexport default 1;\n');
    expect(out!.split('\n')).toHaveLength(code.split('\n').length);
  });

  it('leaves an import alone when a name has no file of its own', () => {
    const code = "import { PhGear, IconContext } from '@phosphor-icons/vue';\nimport { type IconProps } from '@phosphor-icons/vue';\nimport type { IconWeight } from '@phosphor-icons/vue';\n";
    expect(rewriteIconImports(code, dir, exists)).toBeNull();
  });

  it('leaves text that only mentions an import, in a string or after other code, alone', () => {
    const code = "const s = \"import { PhGear } from '@phosphor-icons/vue'\"; // import { PhCheck } from '@phosphor-icons/vue'\n";
    expect(rewriteIconImports(code, dir, exists)).toBeNull();
  });

  it('returns null for code that does not use the package', () => {
    expect(rewriteIconImports("import { PhGear } from './icons';\n", dir, exists)).toBeNull();
  });
});

describe('phosphorIconsDir', () => {
  it('finds the installed one-file-per-icon modules', () => {
    expect(existsSync(path.join(phosphorIconsDir(), 'PhGear.vue.mjs'))).toBe(true);
  });
});
