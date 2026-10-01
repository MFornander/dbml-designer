// Adapted from holistics/dbml dbml-playground (src/components/editor/dbml_services.ts), Apache-2.0. See NOTICE.
import * as monaco from 'monaco-editor';
import { Compiler, Filepath, type MemoryProjectLayout } from '@dbml/parse';
import { DBMLLanguageService } from './dbml_language';

type MonacoServices = ReturnType<Compiler['initMonacoServices']>;

let services: MonacoServices | undefined;
let registered = false;

const languageId = DBMLLanguageService.getLanguageId();

/**
 * Registers Monaco language services backed by the given compiler. Each provider
 * first pushes the editor's current text into the compiler's layout so results
 * reflect what the user sees, not the debounced parse from a moment ago.
 */
export function setupDbmlServices (compiler: Compiler, layout: MemoryProjectLayout): void {
  services = compiler.initMonacoServices();
  if (registered) return;
  registered = true;

  // fsPath decodes the URI, so a path with spaces maps to the same file the parser store uses.
  const sync = (model: monaco.editor.ITextModel): void => {
    layout.setSource(Filepath.from(model.uri.fsPath), model.getValue());
  };

  monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition: (model, position) => {
      sync(model);
      return services!.definitionProvider.provideDefinition(model as any, position as any) as any;
    },
  });

  monaco.languages.registerReferenceProvider(languageId, {
    provideReferences: (model, position) => {
      sync(model);
      return services!.referenceProvider.provideReferences(model as any, position as any) as any;
    },
  });

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: services.autocompletionProvider.triggerCharacters,
    provideCompletionItems: (model, position) => {
      sync(model);
      return services!.autocompletionProvider.provideCompletionItems(model as any, position as any) as any;
    },
  });

  monaco.languages.registerCodeActionProvider(languageId, {
    provideCodeActions: (model, range, context, token) => {
      sync(model);
      return (services!.codeActionProvider as any).provideCodeActions(model, range, context, token);
    },
  });
}

export function updateDiagnosticMarkers (model: monaco.editor.ITextModel): void {
  if (!services) return;
  const filepath = model.uri ? Filepath.from(model.uri.fsPath) : undefined;
  if (!filepath) return;
  const markers = services.diagnosticsProvider.provideMarkers(filepath);
  monaco.editor.setModelMarkers(model, languageId, markers as monaco.editor.IMarkerData[]);
}
