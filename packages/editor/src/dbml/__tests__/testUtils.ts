import {
  Compiler, DEFAULT_ENTRY, MemoryProjectLayout, type Database,
} from '@dbml/parse';

/** Parse DBML that must be valid, for tests. */
export function compile (dbml: string): Database {
  const layout = new MemoryProjectLayout();
  const compiler = new Compiler(layout);
  layout.setSource(DEFAULT_ENTRY, dbml);
  const report = compiler.interpretFile(DEFAULT_ENTRY);
  const errors = report.getErrors();
  if (errors.length > 0) throw new Error(errors.map((e) => e.diagnostic).join('; '));
  return report.getValue() as Database;
}
