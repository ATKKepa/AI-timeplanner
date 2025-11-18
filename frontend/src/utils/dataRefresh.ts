const TASKS_EVENT = 'app:tasks-updated';
const EVENTS_EVENT = 'app:events-updated';

const safeWindow = typeof window !== 'undefined' ? window : undefined;

export function emitTasksUpdated() {
  safeWindow?.dispatchEvent(new Event(TASKS_EVENT));
}

export function emitEventsUpdated() {
  safeWindow?.dispatchEvent(new Event(EVENTS_EVENT));
}

export function subscribeTasksUpdated(handler: () => void): () => void {
  if (!safeWindow) {
    return () => undefined;
  }

  safeWindow.addEventListener(TASKS_EVENT, handler);
  return () => safeWindow.removeEventListener(TASKS_EVENT, handler);
}

export function subscribeEventsUpdated(handler: () => void): () => void {
  if (!safeWindow) {
    return () => undefined;
  }

  safeWindow.addEventListener(EVENTS_EVENT, handler);
  return () => safeWindow.removeEventListener(EVENTS_EVENT, handler);
}
