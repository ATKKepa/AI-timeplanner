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
        p="sm"
        withBorder
        maw="70%"
        style={{
          alignSelf: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <Text fz="xs" c="dimmed">
          {isUser ? 'Sinä' : 'Assistentti'}
        </Text>
        <Text>{message.content}</Text>
      </Paper>
    </Group>
  );
}
