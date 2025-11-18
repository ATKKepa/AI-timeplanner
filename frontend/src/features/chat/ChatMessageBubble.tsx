import type { ChatMessage } from './types';
import { Paper, Text, Group } from '@mantine/core';

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <Group justify={isUser ? 'flex-end' : 'flex-start'}>
      <Paper
        radius="lg"
        c="black"
        p="sm"
        withBorder
        maw="70%"
        bg={isUser ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-gray-0)'}
        style={{
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          borderColor: isUser ? 'var(--mantine-color-blue-filled)' : undefined,
        }}
      >
        <Text fz="xs" c="black">
          {isUser ? 'Minä' : 'Assistentti'}
        </Text>
        <Text>{message.content}</Text>
      </Paper>
    </Group>
  );
}
