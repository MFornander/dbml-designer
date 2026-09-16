// Adapted from holistics/dbml dbml-playground (src/components/editor/dbml_language.ts), Apache-2.0. See NOTICE.
import { dbmlLanguageConfig, dbmlMonarchTokensProvider } from '@dbml/parse';
import * as monaco from 'monaco-editor';
import type { ThemeMode } from '@/types/diagram';
import logger from '@/utils/logger';

const DBML_LANGUAGE_CONFIG = dbmlLanguageConfig as monaco.languages.LanguageConfiguration;
const DBML_TOKEN_PROVIDER = dbmlMonarchTokensProvider as monaco.languages.IMonarchLanguage;

const DBML_THEME_LIGHT: monaco.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
    { token: 'keyword.wildcard', foreground: 'c2185b' },
    { token: 'type', foreground: '008000', fontStyle: 'bold' },
    { token: 'string', foreground: 'a31515' },
    { token: 'string.backtick', foreground: 'a31515', fontStyle: 'italic' },
    { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    { token: 'number', foreground: '098658' },
    { token: 'number.hex', foreground: '3030c0' },
    { token: 'operator', foreground: '000000' },
    { token: 'delimiter', foreground: '000000' },
    { token: 'annotation', foreground: '808080' },
    { token: 'identifier', foreground: '000000' },
  ],
  colors: {
    'editorInfo.foreground': '#64A0DC80',
  },
};

const DBML_THEME_DARK: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
    { token: 'keyword.wildcard', foreground: 'e64553' },
    { token: 'type', foreground: '4ec9b0', fontStyle: 'bold' },
    { token: 'string', foreground: 'ce9178' },
    { token: 'string.backtick', foreground: 'ce9178', fontStyle: 'italic' },
    { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
    { token: 'number', foreground: 'b5cea8' },
    { token: 'number.hex', foreground: '5e9bd6' },
    { token: 'operator', foreground: 'd4d4d4' },
    { token: 'delimiter', foreground: 'd4d4d4' },
    { token: 'annotation', foreground: '9cdcfe' },
    { token: 'identifier', foreground: 'd4d4d4' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editorWarning.foreground': '#64A0DC80',
    'editorInfo.foreground': '#64A0DC80',
  },
};

/**
 * Editor type: dbdiagram keeps Monaco's current default monospace stack (SF Mono first on macOS)
 * and sizes it at 12px on 18px lines. Shared by the DBML editor and the layout YAML view.
 */
export const EDITOR_FONT_FAMILY = '"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace';
export const EDITOR_FONT_SIZE = 12;
export const EDITOR_LINE_HEIGHT = 18;

/**
 * Registers the DBML language, its Monarch tokenizer, and the light and dark themes with Monaco.
 */
export class DBMLLanguageService {
  private static readonly LANGUAGE_ID = 'dbml';
  private static readonly THEME_LIGHT = 'dbml-theme';
  private static readonly THEME_DARK = 'dbml-theme-dark';
  private static isRegistered = false;

  /** Safe to call multiple times. */
  public static registerLanguage (): void {
    if (this.isRegistered) return;
    try {
      monaco.languages.register({ id: this.LANGUAGE_ID });
      monaco.languages.setMonarchTokensProvider(this.LANGUAGE_ID, DBML_TOKEN_PROVIDER);
      monaco.languages.setLanguageConfiguration(this.LANGUAGE_ID, DBML_LANGUAGE_CONFIG);
      monaco.editor.defineTheme(this.THEME_LIGHT, DBML_THEME_LIGHT);
      monaco.editor.defineTheme(this.THEME_DARK, DBML_THEME_DARK);
      this.isRegistered = true;
    } catch (error) {
      logger.warn('Failed to register DBML language:', error);
    }
  }

  public static getLanguageId (): string {
    return this.LANGUAGE_ID;
  }

  public static getThemeName (mode: ThemeMode): string {
    return mode === 'dark' ? this.THEME_DARK : this.THEME_LIGHT;
  }

  public static isLanguageRegistered (): boolean {
    return this.isRegistered;
  }
}
