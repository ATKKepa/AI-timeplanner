import { Checkbox, Group, Stack, Text, Badge, ActionIcon } from '@mantine/core';
import { IconTrash, IconPencil } from '@tabler/icons-react';
import type { Task } from './types';

interface TaskItemProps {
  task: Task;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: Task) => void;
}

export function TaskItem({ task, onToggleStatus, onDelete, onEdit }: TaskItemProps) {
  const isDone = task.status === 'done';

  return (
    <Group align="flex-start" justify="space-between">
      <Group align="flex-start">
        <Checkbox
          checked={isDone}
          onChange={() => onToggleStatus(task.id)}
        />
        <Stack gap={2}>
          <Text td={isDone ? 'line-through' : undefined}>{task.title}</Text>
          <Group gap="xs">
            <Badge size="xs" variant="light">
              {task.list}
            </Badge>
            {task.dueDate && (
              <Text fz="xs" c="dimmed">
                {new Date(task.dueDate).toLocaleDateString()}
              </Text>
            )}
          </Group>
        </Stack>
      </Group>

      <ActionIcon.Group>
        {onEdit && (
          <ActionIcon
            variant="subtle"
            aria-label="Muokkaa tehtävää"
            onClick={() => onEdit(task)}
          >
            <IconPencil size={16} />
          </ActionIcon>
        )}
        <ActionIcon
          variant="subtle"
          aria-label="Poista tehtävä"
          onClick={() => onDelete(task.id)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </ActionIcon.Group>
    </Group>
  );
}
