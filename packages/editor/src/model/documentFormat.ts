/**
 * The two kinds of document the editor works on: DBML, whose layout rides in a footer comment, and
 * model files, JSON whose layout is a property. Both lift the layout out of the text the editor
 * shows and put it back on the way out, so the rest of the app treats them alike.
 */
import { splitLayoutComment, withLayoutComment } from '@/layout';
import { splitModelFile, withModelLayout } from './modelFile';

export type DocumentLanguage = 'dbml' | 'json';

export const DOCUMENT_LANGUAGES: readonly DocumentLanguage[] = ['dbml', 'json'];

/** The language a file is in, by its name. */
export function languageOf (name: string): DocumentLanguage {
  return name.toLowerCase().endsWith('.json') ? 'json' : 'dbml';
}

/** The file extension for a language. */
export function extensionOf (language: DocumentLanguage): string {
  return language === 'json' ? '.json' : '.dbml';
}

/** A file's text split into what the editor shows and its layout as YAML (JSON for a model file), or null for none. */
export function splitDocument (text: string, language: DocumentLanguage): { body: string; layout: string | null } {
  if (language === 'json') return splitModelFile(text);
  const { dbml, layout } = splitLayoutComment(text);
  return {
    body: dbml,
    layout,
  };
}

/** The file to write: the editor's text with the layout, given as footer YAML, put back in. */
export function joinDocument (body: string, layoutYaml: string, language: DocumentLanguage): string {
  return language === 'json' ? withModelLayout(body, layoutYaml) : withLayoutComment(body, layoutYaml);
}
