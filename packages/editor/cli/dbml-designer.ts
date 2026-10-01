/**
 * DBML Designer on the command line, for scripts and for an agent editing a diagram file.
 *
 *   npm run check -- path/to/file.dbml [more.dbml model.json ...]
 *   npm run graph -- path/to/file.dbml [--text]
 *
 * `check` prints the app's errors and warnings for a `.dbml` or a model `.json`, plus problems in
 * the layout the file carries, as `file:line:col: severity: message`, and exits 1 when there are
 * errors. `graph` prints the diagram engine's model of the file as JSON, or as a compact listing
 * with `--text`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Filepath } from '@dbml/parse';
import {
  checkModelFileText, checkText, formatCheck, formatModelText, modelOf,
} from '../src/cli/lib';
import { languageOf } from '../src/model/documentFormat';
import { DiskProjectLayout } from './diskLayout';

const USAGE = `Usage:
  dbml-designer check <file.dbml|file.json> [...]   Report errors and warnings; exit 1 on errors
  dbml-designer graph <file.dbml|file.json> [--text] Print the engine's model as JSON (or a listing)
`;

function read (file: string): string {
  return readFileSync(file, 'utf8');
}

/** The file as the entry of a project on disk, so its `use` imports resolve next to it. */
function project (file: string) {
  const text = read(file);
  const entry = Filepath.from(resolve(file));
  return {
    text,
    opts: {
      entry,
      layout: new DiskProjectLayout(entry, text),
    },
  };
}

function main (argv: string[]): number {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const files = rest.filter((a) => !a.startsWith('--'));

  if (command === 'check' && files.length > 0) {
    let failed = false;
    for (const file of files) {
      const { text, opts } = project(file);
      const result = languageOf(file) === 'json' ? checkModelFileText(text) : checkText(text, opts);
      process.stdout.write(formatCheck(file, result));
      if (result.errors > 0) failed = true;
    }
    return failed ? 1 : 0;
  }

  if (command === 'graph' && files.length === 1) {
    const file = files[0]!;
    const { text, opts } = project(file);
    const { model, check } = languageOf(file) === 'json'
      ? (({ model: m, ...c }) => ({
          model: m,
          check: c,
        }))(checkModelFileText(text))
      : modelOf(text, opts);
    if (!model) {
      process.stderr.write(formatCheck(file, check));
      return 1;
    }
    process.stdout.write(flags.has('--text') ? formatModelText(model) : `${JSON.stringify(model, null, 2)}\n`);
    return 0;
  }

  process.stderr.write(USAGE);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
