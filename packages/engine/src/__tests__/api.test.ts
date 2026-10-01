/**
 * The engine's public API, kept in step with its version. Three files ship with the package:
 * `api.json` lists everything a host can reach (each entry's exports with their signatures, the
 * members of every exported type, the components' props and events), `model.schema.json` is the
 * model's JSON Schema, and `CHANGELOG.md` says what each version changed.
 *
 * A change to the API fails here until it is recorded with `npm run api -w @dbml-designer/engine`,
 * which asks for a new version in `package.json` first, and for a breaking one (the minor number
 * before 1.0, the major after) when something was removed or changed, or a host must now pass
 * something new. Set `ENGINE_API_COMPATIBLE=1` as well to record a change that cannot break a host,
 * such as a new optional parameter. The README must name everything a host uses, and the changelog
 * must have a section for the version.
 */
import {
  describe, it, expect, beforeAll,
} from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import EngineDiagram from '../components/EngineDiagram.vue';
import DiagramCanvas from '../components/DiagramCanvas.vue';
import { MODEL_SCHEMA } from '../modelSchema';
import { ENGINE_VERSION } from '../version';

/** A path in the package folder. */
const inPackage = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(inPackage(p), 'utf8');
const UPDATE = process.env.ENGINE_API_UPDATE === '1';
const COMPATIBLE = process.env.ENGINE_API_COMPATIBLE === '1';
const PACKAGE_VERSION = (JSON.parse(read('package.json')) as { version: string }).version;

const ENTRIES = ['core', 'index', 'standalone'] as const;
/** Components whose props and events are read from the compiled component, which the type checker sees only through a shim. */
const COMPONENTS: Record<string, unknown> = {
  EngineDiagram,
  DiagramCanvas,
};
/** Types a host fills in: a new member it must give breaks it. */
const INPUT_TYPE = /^type (Model[A-Za-z]*|EngineOptions|MountOptions)\./;

const FORMAT = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType | ts.TypeFormatFlags.WriteArrowStyleSignature;
/** Longer types than this are written `{ … }`; what they hold is listed under their own names. */
const LONG = 160;

interface ApiFile {
  version: string;
  note: string;
  api: Record<string, string>;
}

const NOTE = 'The public API of @dbml-designer/engine at this version, written by `npm run api` (see the README, "Versioning"). Keys: `<entry> <name>` for what an entry exports, `type <Name>.<member>` for members of exported types (`?` when optional), `component <Name>.props` and `.emits` for components. CHANGELOG.md says what changed between versions.';

/** Read the public API from the sources: what each entry exports, with its type. */
function apiSurface (): Record<string, string> {
  const config = ts.readConfigFile(inPackage('tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, inPackage(''));
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const checker = program.getTypeChecker();
  const out = new Map<string, string>();
  const text = (t: ts.Type, at: ts.Node) => {
    const s = checker.typeToString(t, at, FORMAT).replace(/import\("[^"]*"\)\./g, '').replace(/\s+/g, ' ');
    return s.length > LONG ? '{ … }' : s;
  };
  const isPlainObject = (t: ts.Type) => (t.flags & ts.TypeFlags.Object) !== 0 && !t.isUnion()
    && t.getCallSignatures().length === 0 && checker.getPropertiesOfType(t).length > 0
    && checker.getIndexInfosOfType(t).length === 0;
  const isAnonymous = (t: ts.Type) => isPlainObject(t) && ((t as ts.ObjectType).objectFlags & ts.ObjectFlags.Anonymous) !== 0;

  /** Members of an object type, one entry each; objects without a name of their own one level deeper. */
  function members (name: string, t: ts.Type, at: ts.Node, depth: number): void {
    for (const p of checker.getPropertiesOfType(t)) {
      const decl = p.valueDeclaration ?? p.declarations?.[0] ?? at;
      const pt = checker.getTypeOfSymbolAtLocation(p, decl);
      const key = `${name}.${p.name}`;
      if (depth < 1 && isAnonymous(pt)) members(key, pt, at, depth + 1);
      else out.set(`type ${key}${p.flags & ts.SymbolFlags.Optional ? '?' : ''}`, text(pt, decl));
    }
  }

  // Every entry has all of core; the others are listed with what they add.
  const inCore = new Set<string>();
  for (const entry of ENTRIES) {
    const file = program.getSourceFile(inPackage(`src/${entry}.ts`))!;
    const moduleSymbol = checker.getSymbolAtLocation(file)!;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const name = exported.name;
      if (entry === 'core') inCore.add(name);
      else if (inCore.has(name)) continue;
      const s = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const decl = s.valueDeclaration ?? s.declarations?.[0] ?? file;
      if (name in COMPONENTS) {
        const c = COMPONENTS[name] as { props?: Record<string, { required?: boolean }>; emits?: string[] | Record<string, unknown> };
        out.set(`${entry} ${name}`, 'component');
        out.set(`component ${name}.props`, Object.entries(c.props ?? {}).map(([k, v]) => `${k}${v?.required ? '' : '?'}`).sort().join(', '));
        out.set(`component ${name}.emits`, (Array.isArray(c.emits) ? c.emits : Object.keys(c.emits ?? {})).slice().sort().join(', '));
        continue;
      }
      if (s.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) {
        const t = checker.getDeclaredTypeOfSymbol(s);
        out.set(`${entry} ${name}`, s.flags & ts.SymbolFlags.Interface ? 'interface' : 'type');
        if (isPlainObject(t)) members(name, t, decl, 0);
        else out.set(`type ${name}`, text(t, decl));
      }
      if (s.flags & ts.SymbolFlags.Value) {
        const t = checker.getTypeOfSymbolAtLocation(s, decl);
        const signatures = t.getCallSignatures();
        out.set(`${entry} ${name}`, signatures.length > 0
          ? signatures.map((sig) => {
              const params = sig.getParameters().map((p) => {
                const pd = p.valueDeclaration as ts.ParameterDeclaration | undefined;
                const optional = !!pd && (!!pd.questionToken || !!pd.initializer);
                return `${pd?.dotDotDotToken ? '...' : ''}${p.name}${optional ? '?' : ''}: ${text(checker.getTypeOfSymbolAtLocation(p, pd ?? decl), decl)}`;
              });
              return `(${params.join(', ')}) => ${text(sig.getReturnType(), decl)}`;
            }).join(' | ')
          : text(t, decl));
      }
    }
  }
  return Object.fromEntries([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function difference (before: Record<string, string>, after: Record<string, string>) {
  return {
    added: Object.keys(after).filter((k) => !(k in before)),
    removed: Object.keys(before).filter((k) => !(k in after)),
    changed: Object.keys(after).filter((k) => k in before && before[k] !== after[k]),
  };
}

const semver = (v: string) => v.split('.').map(Number) as [number, number, number];
const newer = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)];
  return x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];
};
/** Whether going from `from` to `to` may break hosts: the major number, or the minor one before 1.0. */
const breakingStep = (from: string, to: string) => {
  const [a, b] = [semver(from), semver(to)];
  return a[0] === 0 ? b[0] > 0 || b[1] > a[1] : b[0] > a[0];
};

describe('the public API', () => {
  let surface: Record<string, string>;
  beforeAll(() => {
    surface = apiSurface();
  }, 120_000);

  it('is the one api.json records for this version', () => {
    const recorded = existsSync(inPackage('api.json')) ? JSON.parse(read('api.json')) as ApiFile : null;
    const d = difference(recorded?.api ?? {}, surface);
    const changes = [...d.removed.map((k) => `- ${k}`), ...d.changed.map((k) => `~ ${k}: ${recorded!.api[k]} -> ${surface[k]}`), ...d.added.map((k) => `+ ${k}: ${surface[k]}`)];
    if (changes.length === 0) {
      expect(recorded!.version === PACKAGE_VERSION || newer(PACKAGE_VERSION, recorded!.version)).toBe(true);
      return;
    }
    const breaking = [...d.removed, ...d.changed, ...d.added.filter((k) => INPUT_TYPE.test(k) && !k.endsWith('?'))];
    if (!UPDATE) {
      expect.fail([
        'The public API changed:',
        ...changes,
        '',
        `Record it: set a new version in packages/engine/package.json and src/version.ts${breaking.length > 0 ? ' (a breaking step: the minor number before 1.0, the major after)' : ''}, run \`npm run api -w @dbml-designer/engine\`, and say what changed in CHANGELOG.md.`,
      ].join('\n'));
    }
    if (recorded) {
      expect(newer(PACKAGE_VERSION, recorded.version), `api.json records ${recorded.version}: set a newer version in package.json first`).toBe(true);
      if (breaking.length > 0 && !COMPATIBLE) {
        expect(breakingStep(recorded.version, PACKAGE_VERSION), `These changes can break a host, so ${recorded.version} -> ${PACKAGE_VERSION} must be a breaking step (or set ENGINE_API_COMPATIBLE=1 if they cannot):\n${breaking.join('\n')}`).toBe(true);
      }
    }
    const file: ApiFile = {
      version: PACKAGE_VERSION,
      note: NOTE,
      api: surface,
    };
    writeFileSync(inPackage('api.json'), `${JSON.stringify(file, null, 2)}\n`);
  });

  it('has its model schema shipped as model.schema.json', () => {
    const schema = `${JSON.stringify(MODEL_SCHEMA, null, 2)}\n`;
    if (UPDATE) writeFileSync(inPackage('model.schema.json'), schema);
    expect(read('model.schema.json'), 'model.schema.json is behind MODEL_SCHEMA: run `npm run api -w @dbml-designer/engine`').toBe(schema);
  });

  it('carries the package version, with a changelog section and a README that says it', () => {
    expect(ENGINE_VERSION).toBe(PACKAGE_VERSION);
    expect(read('CHANGELOG.md')).toMatch(new RegExp(`^## ${PACKAGE_VERSION.replace(/\./g, '\\.')}\\b`, 'm'));
    expect(read('README.md')).toContain(`version ${PACKAGE_VERSION}`);
  });

  it('is named in the README: every export, engine member, option, event, and model field', () => {
    const readme = read('README.md');
    const named = (name: string) => new RegExp(`\`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\`(?.:<\\s]`).test(readme);
    const documented = /^type (Model[A-Za-z]*|EngineOptions|MountOptions|DisplayOptions|Engine|Views|Layout|ModelValue)\./;
    const names = new Set<string>();
    for (const key of Object.keys(surface)) {
      const exported = /^(?:core|index|standalone) (\S+)$/.exec(key);
      if (exported) names.add(exported[1]!);
      else if (documented.test(key)) names.add(key.replace(/\?$/, '').split('.').pop()!);
      else if (key.startsWith('component EngineDiagram.')) for (const n of surface[key]!.split(', ')) if (n) names.add(n.replace(/\?$/, ''));
    }
    const missing = [...names].filter((n) => !named(n)).sort();
    expect(missing, 'the README does not name these').toEqual([]);
  });
});
