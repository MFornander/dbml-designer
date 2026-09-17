/**
 * A project layout that reads `.dbml` files straight from disk, so the command line resolves
 * `use` imports the way the app does when it follows a file. The entry's text may be overridden,
 * for checking unsaved content.
 */
import {
  existsSync, readFileSync, readdirSync, statSync,
} from 'node:fs';
import path from 'node:path';
import { Filepath } from '@dbml/parse';
import type { Compiler } from '@dbml/parse';

type DbmlProjectLayout = ConstructorParameters<typeof Compiler>[0];

export class DiskProjectLayout implements DbmlProjectLayout {
  private readonly overrides = new Map<string, string>();

  constructor (private readonly entry: Filepath, entryText?: string) {
    if (entryText !== undefined) this.overrides.set(entry.absolute, entryText);
  }

  getSource (filePath: Filepath): string | undefined {
    const override = this.overrides.get(filePath.absolute);
    if (override !== undefined) return override;
    try {
      return readFileSync(filePath.absolute, 'utf8');
    } catch {
      return undefined;
    }
  }

  exists (filePath: Filepath): boolean {
    return this.overrides.has(filePath.absolute) || existsSync(filePath.absolute);
  }

  isFile (filePath: Filepath): boolean {
    if (this.overrides.has(filePath.absolute)) return true;
    try {
      return statSync(filePath.absolute).isFile();
    } catch {
      return false;
    }
  }

  isDirectory (filePath: Filepath): boolean {
    try {
      return statSync(filePath.absolute).isDirectory();
    } catch {
      return false;
    }
  }

  listDirectory (dirPath?: Filepath): Filepath[] {
    const dir = dirPath?.absolute ?? this.entry.dirname;
    try {
      return readdirSync(dir).map((name) => Filepath.from(path.join(dir, name)));
    } catch {
      return [];
    }
  }

  getEntrypoints (): Filepath[] {
    return [this.entry];
  }
}
