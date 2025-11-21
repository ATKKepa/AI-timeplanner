import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core';
import dayjs from 'dayjs';
import type { Task } from '../tasks/types';
import { normalizeTask, parseTasksResponse } from '../tasks/taskApi';
import { subscribeTasksUpdated } from '../../utils/dataRefresh';

const LIST_LABELS: Record<Task['list'], string> = {
  Inbox: 'Inbox',
  Work: 'Work',
  Personal: 'Personal',
};

interface MiniTasksCardProps {
  refreshKey?: number;
}

export function MiniTasksCard({ refreshKey = 0 }: MiniTasksCardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/tasks');
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const payload: unknown = await res.json();
      const apiTasks = parseTasksResponse(payload);
      const mapped: Task[] = apiTasks.map(normalizeTask);

      setTasks(mapped);
    } catch (error: unknown) {
      console.error('Failed to fetch tasks', error);
      setError('Tehtävien haku epäonnistui');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks, refreshKey]);

  useEffect(() => subscribeTasksUpdated(() => void fetchTasks()), [fetchTasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDate = a.dueDate ? dayjs(a.dueDate).valueOf() : Number.MAX_SAFE_INTEGER;
      const bDate = b.dueDate ? dayjs(b.dueDate).valueOf() : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
  }, [tasks]);

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={500}>Tehtävät</Text>
          {loading && <Loader size="sm" />}
        </Group>

        {error && (
          <Text fz="xs" c="red">
            {error}
          </Text>
        )}

        <ScrollArea h={240} offsetScrollbars>
          <Stack gap="sm" pr="xs">
            {!loading && sortedTasks.length === 0 && (
              <Text fz="sm" c="dimmed">
                Ei tehtäviä listattavaksi.
              </Text>
            )}

            {sortedTasks.map((task) => (
              <Card key={task.id} withBorder radius="md" p="xs">
                <Stack gap={4}>
                  <Group justify="space-between" align="center">
                    <Text fw={500}>{task.title}</Text>
                    <Badge size="xs" variant="light" color="blue">
                      {LIST_LABELS[task.list]}
                    </Badge>
                  </Group>
                  <Group gap="xs" c="dimmed" fz="xs">
                    <Text>{task.status === 'done' ? 'Valmis' : 'Avoin'}</Text>
                    {task.dueDate && (
                      <Text>{dayjs(task.dueDate).format('DD.MM.YYYY')}</Text>
                    )}
                  </Group>
                </Stack>
              </Card>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    </Card>
  );
}
