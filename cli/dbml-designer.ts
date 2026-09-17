/**
 * DBML Designer on the command line, for scripts and for an agent editing the DBML.
 *
 *   npm run check -- path/to/file.dbml [more.dbml ...]
 *   npm run graph -- path/to/file.dbml [--text]
 *
 * `check` prints the app's DBML errors and warnings plus problems in the layout footer as
 * `file:line:col: severity: message` and exits 1 when there are errors. `graph` prints the
 * tables, relationships, and lineage as JSON, or as a compact listing with `--text`.
 */
import { readFileSync } from 'node:fs';
import {
  checkText, formatCheck, formatGraphText, graphOf,
} from '../src/cli/lib';

const USAGE = `Usage:
  dbml-designer check <file.dbml> [...]   Report errors and warnings; exit 1 on errors
  dbml-designer graph <file.dbml> [--text] Print tables, refs, and deps as JSON (or text)
`;

function read (file: string): string {
  return readFileSync(file, 'utf8');
}

function main (argv: string[]): number {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const files = rest.filter((a) => !a.startsWith('--'));

  if (command === 'check' && files.length > 0) {
    let failed = false;
    for (const file of files) {
      const result = checkText(read(file));
      process.stdout.write(formatCheck(file, result));
      if (result.errors > 0) failed = true;
    }
    return failed ? 1 : 0;
  }

  if (command === 'graph' && files.length === 1) {
    const file = files[0]!;
    const { graph, check } = graphOf(read(file));
    if (!graph) {
      process.stderr.write(formatCheck(file, check));
      return 1;
    }
    process.stdout.write(flags.has('--text') ? formatGraphText(graph) : `${JSON.stringify(graph, null, 2)}\n`);
    return 0;
  }

  process.stderr.write(USAGE);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
