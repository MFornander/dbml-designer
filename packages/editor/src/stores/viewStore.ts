import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useEngineStore } from './engineStore';
import { useParserStore } from './parserStore';
import { useUiStore } from './uiStore';

/** The view a link asks for, `?view=name`, or null. */
export function viewFromLocation (search: string = typeof location === 'undefined' ? '' : location.search): string | null {
  return new URLSearchParams(search).get('view') || null;
}

/**
 * The editor's diagram views: its engine's view state (see `engineStore`), and the requests the
 * header's menu makes of the Diagram Views panel. Save writes the working set back into the DBML.
 *
 * A view can also be opened from outside: a link's `?view=name` opens that view as soon as the
 * document has it, and with "follow new views" on, a view the followed file gains on disk is
 * switched to. The engine arranges a view switched to that has no arrangement of its own.
 */
export const useViewStore = defineStore('views', () => {
  const { engine } = useEngineStore();
  const parser = useParserStore();
  const ui = useUiStore();

  /** A request from elsewhere to name a new view or rename the active one; the panel opens its name form and clears this. */
  const pendingRequest = ref<'create' | 'rename' | null>(null);

  function requestCreate (): void {
    pendingRequest.value = 'create';
  }

  function requestRename (): void {
    pendingRequest.value = 'rename';
  }

  function clearRequest (): void {
    pendingRequest.value = null;
  }

  const names = () => new Set(engine.views.views.value.map((v) => v.name));

  /** The view the page's link asked for, until the document has it; a followed file may still be on its way. */
  const requested = ref<string | null>(viewFromLocation());
  watch([requested, engine.views.views], ([name, views]) => {
    if (name === null || !views.some((v) => v.name === name)) return;
    requested.value = null;
    engine.views.select(name);
  }, {
    immediate: true,
  });

  /** The views there were before a change on disk was taken in, until the text it brought is read. */
  let beforeDiskChange: ReadonlySet<string> | null = null;

  /** The followed file changed on disk and its text is being taken in. */
  function noteDiskChange (): void {
    beforeDiskChange ??= names();
  }

  // Once that text is read: with "follow new views" on, switch to the last view it added.
  watch(() => parser.parseVersion, () => {
    const before = beforeDiskChange;
    if (before === null || parser.isLoading) return;
    beforeDiskChange = null;
    if (!ui.followNewViews) return;
    const added = engine.views.views.value.filter((v) => !before.has(v.name));
    if (added.length > 0) engine.views.select(added[added.length - 1]!.name);
  }, {
    flush: 'post',
  });

  return {
    ...engine.views,
    pendingRequest,
    requestCreate,
    requestRename,
    clearRequest,
    noteDiskChange,
  };
});
