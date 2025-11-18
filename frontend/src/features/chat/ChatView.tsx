import { useState } from 'react';
import {
  Button,
  Card,
  Group,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import type { ChatMessage } from './types';
import { ChatMessageBubble } from './ChatMessageBubble';

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

    const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    // lisää käyttäjän viesti heti
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
    <Stack h="100%">
      <Text fw={600} fz="lg">
        Chat-assistentti
      </Text>

      <Card withBorder radius="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <ScrollArea style={{ flex: 1 }}>
          <Stack p="xs">
            {messages.map((m) => (
              <ChatMessageBubble key={m.id} message={m} />
            ))}
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
    </Stack>
  );
}
