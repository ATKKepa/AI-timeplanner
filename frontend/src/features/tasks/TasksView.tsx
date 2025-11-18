import { useState } from 'react';
import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import dayjs from 'dayjs';
import type { Task } from './types';
import { TaskItem } from './TaskItem';

function createInitialTasks(): Task[] {
  const now = new Date().toISOString();
  return [
    {
      id: '1',
      title: 'Luo Azure-tili ja tarkista krediitit',
      list: 'Inbox',
      status: 'open',
      createdAt: now,
    },
    {
      id: '2',
      title: 'Rakena chat-näkymä AI Timeplanneriin',
      list: 'Work',
      status: 'open',
      createdAt: now,
    },
  ];
}

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>(createInitialTasks);
  const [title, setTitle] = useState('');
  const [list, setList] = useState<'Inbox' | 'Work' | 'Personal'>('Inbox');
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const handleAddTask = () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: trimmed,
      list,
      status: 'open',
      createdAt: new Date().toISOString(),
      dueDate: dueDate ? dueDate.toISOString() : undefined,
    };

    setTasks((prev) => [newTask, ...prev]);
    setTitle('');
    setDueDate(null);
  };

  const handleToggleStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'open' ? 'done' : 'open' } : t,
      ),
    );
  };

  const handleDelete = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const openTasks = tasks.filter((t) => t.status === 'open');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  return (
    <Stack>
      <Text fw={600} fz="lg">
        Tehtävälista
      </Text>

      {/* Uusi tehtävä -lomake */}
      <Card withBorder radius="md">
        <Stack gap="xs">
          <TextInput
            label="Tehtävä"
            placeholder="Mitä pitää tehdä?"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <Group grow>
            <Select
              label="Lista"
              data={['Inbox', 'Work', 'Personal']}
              value={list}
              onChange={(value) =>
                setList((value as 'Inbox' | 'Work' | 'Personal') ?? 'Inbox')
              }
            />
            <DateInput
              label="Eräpäivä"
              value={dueDate}
              onChange={(val) =>
                setDueDate(
                  val == null
                    ? null
                    : typeof val === 'string'
                    ? dayjs(val, 'DD.MM.YYYY').toDate()
                    : val,
                )
              }
              valueFormat="DD.MM.YYYY"
              clearable
              minDate={dayjs().toDate()}
            />
          </Group>
          <Group justify="flex-end">
            <Button onClick={handleAddTask}>Lisää tehtävä</Button>
          </Group>
        </Stack>
      </Card>

      {/* Avoimet tehtävät */}
      <Card withBorder radius="md">
        <Stack gap="sm">
          <Text fw={500}>Avoimet</Text>
          {openTasks.length === 0 && (
            <Text fz="sm" c="dimmed">
              Ei avoimia tehtäviä.
            </Text>
          )}
          {openTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />
          ))}
        </Stack>
      </Card>

      {/* Valmiit tehtävät */}
      {doneTasks.length > 0 && (
        <Card withBorder radius="md">
          <Stack gap="sm">
            <Text fw={500}>Valmiit</Text>
            {doneTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
              />
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
