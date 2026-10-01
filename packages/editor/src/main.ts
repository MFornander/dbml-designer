// Adapted from holistics/dbml dbml-playground (src/main.ts), Apache-2.0. See NOTICE.
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/open-sans/700.css';
import '@fontsource/inconsolata/400.css';
import '@fontsource/inconsolata/700.css';
import './styles/main.css';
import { DBMLLanguageService } from '@/editor/dbml_language';
import App from './App.vue';

self.MonacoEnvironment = {
  // Model files are JSON, checked against their schema in the JSON worker.
  getWorker: (_workerId: string, label: string) => (label === 'json' ? new jsonWorker() : new editorWorker()),
};

DBMLLanguageService.registerLanguage();

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
