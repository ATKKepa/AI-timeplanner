import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import type { ChatMessage } from './types';
import { ChatMessageBubble } from './ChatMessageBubble';
import { MiniCalendarCard } from './MiniCalendarCard';
import { MiniTasksCard } from './MiniTasksCard';
import { emitEventsUpdated, emitTasksUpdated } from '../../utils/dataRefresh';

function createInitialMessages(): ChatMessage[] {
  return [
    {
      id: '1',
      role: 'assistant',
      content:
        'Moikka! Olen sun ajan­hallinnan AI-assari. Kokeile kirjoittaa esim: "Lisää huomiselle tehtävä lähettää CV".',
      createdAt: new Date().toISOString(),
    },
  ];
}

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>(createInitialMessages);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

    const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          typeof data.reply === 'string'
            ? data.reply
            : 'Sain viestisi, mutta en saanut vastausta backendiltä.',
        createdAt: new Date().toISOString(),
      };

      const toolsUsed: string[] = Array.isArray(data.toolUsed) ? data.toolUsed : [];
      if (
        toolsUsed.some((tool) =>
          ['create_task', 'delete_task', 'delete_tasks_in_list', 'update_task'].includes(tool)
        )
      ) {
        emitTasksUpdated();
      }
      if (toolsUsed.some((tool) => ['create_event', 'delete_event', 'update_event'].includes(tool))) {
        emitEventsUpdated();
      }

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e) {
      console.error('Chat request failed', e);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'Jotain meni pieleen yhteydessä palvelimeen. Yritä hetken päästä uudestaan.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };


    const handleEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <Stack h="100%" gap="lg" mah="1000">
      <Text fw={600} fz="lg">
        Chat-assistentti
      </Text>

      <SimpleGrid
        cols={{ base: 1, md: 2 }}
        spacing="lg"
        style={{ flex: 1, minHeight: 0 }}
      >
        <Card
          withBorder
          radius="md"
          p="md"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '60vh',
          }}
        >
          <ScrollArea style={{ flex: 1, minHeight: 0 }} offsetScrollbars>
            <Stack p="xs" gap="sm">
              {messages.map((m) => (
                <ChatMessageBubble key={m.id} message={m} />
              ))}
              <div ref={messagesEndRef} />
            </Stack>
          </ScrollArea>

          <Stack gap="xs" mt="sm">
            <Textarea
              placeholder='Kirjoita viesti, esim. "Lisää huomiselle tehtävä lähettää CV"'
              autosize
              minRows={2}
              maxRows={4}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleEnter}
            />
            <Group justify="flex-end">
              <Button onClick={handleSend}>Lähetä</Button>
            </Group>
          </Stack>
        </Card>

        <Stack gap="lg" style={{ minHeight: '60vh' }}>
          <MiniCalendarCard />
          <MiniTasksCard />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
