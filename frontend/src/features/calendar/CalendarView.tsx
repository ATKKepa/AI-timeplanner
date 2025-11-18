import { Card, Stack, Text } from '@mantine/core';

export function CalendarView() {
  return (
    <Stack>
      <Text fw={600} fz="lg">
        Kalenteri
      </Text>
      <Card withBorder radius="md">
        <Text c="dimmed" fz="sm">
          Tänne tulee myöhemmin viikko-/päivänäkymä tapahtumille.
        </Text>
      </Card>
    </Stack>
  );
}
