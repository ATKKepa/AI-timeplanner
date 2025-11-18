export type TaskStatus = 'open' | 'done';

export interface Task {
  id: string;
  title: string;
  list: 'Inbox' | 'Work' | 'Personal';
  dueDate?: string; // ISO string
  status: TaskStatus;
  createdAt: string;
}
