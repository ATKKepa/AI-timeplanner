import type { Task } from './types';

export type ApiTaskPayload = {
  id?: unknown;
  title?: unknown;
  list?: unknown;
  status?: unknown;
  createdAt?: unknown;
  dueDate?: unknown;
};

const isTaskList = (value: unknown): value is Task['list'] =>
  value === 'Inbox' || value === 'Work' || value === 'Personal';

const isTaskStatus = (value: unknown): value is Task['status'] =>
  value === 'open' || value === 'done';

const fallbackId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}`;

export const normalizeTask = (task: ApiTaskPayload): Task => ({
  id: typeof task.id === 'string' && task.id.length > 0 ? task.id : fallbackId(),
  title: typeof task.title === 'string' && task.title.length > 0
    ? task.title
    : 'Untitled task',
  list: isTaskList(task.list) ? task.list : 'Inbox',
  status: isTaskStatus(task.status) ? task.status : 'open',
  createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString(),
  dueDate: typeof task.dueDate === 'string' ? task.dueDate : undefined,
});

export const parseTasksResponse = (payload: unknown): ApiTaskPayload[] => {
  if (payload && typeof payload === 'object' && 'tasks' in payload) {
    const { tasks } = payload as { tasks?: unknown };
    if (Array.isArray(tasks)) {
      return tasks as ApiTaskPayload[];
    }
  }
  return [];
};

export const parseTaskPayload = (payload: unknown): ApiTaskPayload =>
  payload && typeof payload === 'object' ? (payload as ApiTaskPayload) : {};
