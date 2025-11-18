import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Card,
  Divider,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import dayjs from 'dayjs';
import { IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import { subscribeEventsUpdated } from '../../utils/dataRefresh';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  list?: string;
}

interface MiniCalendarCardProps {
  refreshKey?: number;
}

export function MiniCalendarCard({ refreshKey = 0 }: MiniCalendarCardProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().startOf('month'));
  const [selectedDay, setSelectedDay] = useState<dayjs.Dayjs | null>(dayjs());

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/events');
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      const apiEvents = (data.events ?? []) as CalendarEvent[];
      setEvents(apiEvents);
    } catch (err) {
      console.error('Failed to fetch events', err);
      setError('Tapahtumien haku epäonnistui');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents, refreshKey]);

  useEffect(() => subscribeEventsUpdated(() => void fetchEvents()), [fetchEvents]);

  const eventsByDay = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      let cursor = dayjs(event.start).startOf('day');
      let last = dayjs(event.end).startOf('day');

      if (last.isBefore(cursor)) {
        last = cursor;
      }

      while (cursor.isBefore(last) || cursor.isSame(last, 'day')) {
        const key = cursor.format('YYYY-MM-DD');
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(event);

        if (cursor.isSame(last, 'day')) {
          break;
        }
        cursor = cursor.add(1, 'day');
      }
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf());
    }
    return grouped;
  }, [events]);

  const weekdayLabels = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

  const calendarDays = useMemo(() => {
    const first = currentMonth.clone().startOf('month');
    const offset = (first.day() + 6) % 7;
    const gridStart = first.subtract(offset, 'day');
    return Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'));
  }, [currentMonth]);

  const selectedKey = selectedDay?.format('YYYY-MM-DD');
  const selectedDayMoment = selectedKey ? dayjs(selectedKey) : null;
  const selectedEvents = selectedKey ? eventsByDay[selectedKey] ?? [] : [];

  return (
    <Card withBorder radius="md" p="md" miw={280}>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Edellinen kuukausi"
              onClick={() => setCurrentMonth((prev) => prev.subtract(1, 'month'))}
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Seuraava kuukausi"
              onClick={() => setCurrentMonth((prev) => prev.add(1, 'month'))}
            >
              <IconChevronRight size={16} />
            </ActionIcon>
            <Text fw={600}>{currentMonth.format('MMMM YYYY')}</Text>
          </Group>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Päivitä tapahtumat"
            onClick={() => void fetchEvents()}
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>

        {error && (
          <Text fz="xs" c="red">
            {error}
          </Text>
        )}

        <Stack gap={4}>
          <Group gap={0} grow>
            {weekdayLabels.map((label) => (
              <Text key={label as string} fz="xs" fw={500} ta="center">
                {label}
              </Text>
            ))}
          </Group>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: 4,
            }}
          >
            {calendarDays.map((day) => {
              const key = day.format('YYYY-MM-DD');
              const eventCount = eventsByDay[key]?.length ?? 0;
              const isCurrent = day.isSame(currentMonth, 'month');
              const isSelected = selectedKey ? day.isSame(selectedDay, 'day') : false;
              const isToday = day.isSame(dayjs(), 'day');

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(day.clone())}
                  style={{
                    border: isToday ? '1px solid var(--mantine-color-blue-filled)' : '1px solid transparent',
                    borderRadius: 8,
                    padding: '6px 0',
                    cursor: 'pointer',
                    backgroundColor: isSelected
                      ? 'var(--mantine-color-blue-light)'
                      : 'var(--mantine-color-body)',
                    color: isCurrent ? 'inherit' : 'var(--mantine-color-dimmed)',
                  }}
                >
                  <Stack gap={2} align="center">
                    <Text fz="sm" fw={500}>
                      {day.date()}
                    </Text>
                    {eventCount > 0 ? (
                      <Badge size="xs" variant="light" color="blue">
                        {eventCount}
                      </Badge>
                    ) : (
                      <div style={{ height: 16 }} />
                    )}
                  </Stack>
                </button>
              );
            })}
          </div>
        </Stack>

        <Divider my="xs" label="Valitun päivän tapahtumat" labelPosition="center" />

        <ScrollArea w="100%" h={150} offsetScrollbars>
          <Stack gap="xs" pr="xs">
            {loading && events.length === 0 && <Loader size="sm" />}
            {!loading && selectedEvents.length === 0 && (
              <Text fz="sm" c="dimmed">
                Ei tapahtumia valitulle päivälle.
              </Text>
            )}
            {selectedEvents.map((event) => {
              const startLabel = dayjs(event.start).format('ddd D.M HH:mm');
              const endLabel = dayjs(event.end).format('ddd D.M HH:mm');
              const startDay = dayjs(event.start).startOf('day');
              const endDay = dayjs(event.end).startOf('day');
              const spansMultipleDays = endDay.isAfter(startDay);

              let timingLabel = `${startLabel} → ${endLabel}`;
              if (selectedDayMoment && spansMultipleDays) {
                if (selectedDayMoment.isSame(startDay)) {
                  timingLabel = `${startLabel} → jatkuu`;
                } else if (selectedDayMoment.isSame(endDay)) {
                  timingLabel = `Jatkuu → ${endLabel}`;
                } else if (
                  selectedDayMoment.isAfter(startDay) &&
                  selectedDayMoment.isBefore(endDay)
                ) {
                  timingLabel = 'Jatkuu koko päivän';
                }
              }

              return (
                <Card key={event.id} withBorder radius="md" p="xs">
                  <Stack gap={4}>
                    <Group gap="xs" justify="space-between" wrap="nowrap">
                      <Stack gap={2} style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Text fw={500}>{event.title}</Text>
                          {event.list && (
                            <Badge size="xs" variant="light" color="blue">
                              {event.list}
                            </Badge>
                          )}
                          {spansMultipleDays && (
                            <Badge size="xs" variant="dot" color="violet">
                              Monipäiväinen
                            </Badge>
                          )}
                        </Group>
                        <Text fz="xs" c="dimmed">
                          {timingLabel}
                        </Text>
                        {spansMultipleDays && (
                          <Text fz="10px" c="dimmed">
                            {startLabel} → {endLabel}
                          </Text>
                        )}
                      </Stack>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </ScrollArea>
      </Stack>
    </Card>
  );
}
