import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import dayjs from "dayjs";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPencil,
  IconTrash,
  IconClockHour4,
} from "@tabler/icons-react";
import { emitEventsUpdated } from "../../utils/dataRefresh";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  list?: string;
}

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().startOf("month"));
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const mapEvent = (e: any): CalendarEvent => ({
    id: String(e.id),
    title: String(e.title),
    start: String(e.start),
    end: String(e.end),
    list: e.list ? String(e.list) : undefined,
  });

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/events");
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      const apiEvents = (data.events ?? []) as any[];
      setEvents(apiEvents.map(mapEvent));
    } catch (e) {
      console.error("Failed to fetch events", e);
      setError("Tapahtumien haku epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      setCurrentMonth(dayjs(selectedDate).startOf("month"));
    }
  }, [selectedDate]);

  const eventsByDay = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};

    for (const event of events) {
      let cursor = dayjs(event.start).startOf("day");
      let last = dayjs(event.end).startOf("day");

      if (last.isBefore(cursor)) {
        last = cursor;
      }

      while (cursor.isBefore(last) || cursor.isSame(last, "day")) {
        const key = cursor.format("YYYY-MM-DD");
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(event);

        if (cursor.isSame(last, "day")) {
          break;
        }
        cursor = cursor.add(1, "day");
      }
    }

    Object.values(grouped).forEach((dayEvents) =>
      dayEvents.sort(
        (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf()
      )
    );

    return grouped;
  }, [events]);

  const selectedDayKey = selectedDate
    ? dayjs(selectedDate).format("YYYY-MM-DD")
    : null;
  const selectedDayMoment = selectedDayKey ? dayjs(selectedDayKey) : null;
  const selectedDayEvents = selectedDayKey
    ? eventsByDay[selectedDayKey] ?? []
    : [];

  const weekdayLabels = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];

  const calendarDays = useMemo(() => {
    const startOfMonth = currentMonth.startOf("month");
    const offset = startOfMonth.day();
    const gridStart = startOfMonth.subtract(offset, "day");

    return Array.from({ length: 42 }, (_, index) => gridStart.add(index, "day"));
  }, [currentMonth]);

  const handleDayClick = (day: dayjs.Dayjs) => {
    setSelectedDate(day.toDate());
    setCurrentMonth(day.startOf("month"));
  };

  const goToToday = () => {
    const today = dayjs();
    setSelectedDate(today.toDate());
    setCurrentMonth(today.startOf("month"));
  };

  const handleCreateEvent = async () => {
    const trimmed = title.trim();
    if (!trimmed || !start || !end) return;

    // varmistetaan että meillä on Date-oliot
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);

    try {
      setError(null);

      const body = {
        title: trimmed,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        list: "Default",
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      const newEvent = mapEvent(data);

      setEvents((prev) => [...prev, newEvent]);
      setTitle("");
      setStart(null);
      setEnd(null);
      emitEventsUpdated();
    } catch (e) {
      console.error("Failed to create event", e);
      setError("Tapahtuman luonti epäonnistui");
    }
  };

  const updateEventOnServer = async (
    id: string,
    payload: Record<string, unknown>
  ) => {
    const res = await fetch(`/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const data = await res.json();
    return mapEvent(data);
  };

  const updateEventState = (updated: CalendarEvent) => {
    setEvents((prev) => prev.map((event) => (event.id === updated.id ? updated : event)));
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      setEvents((prev) => prev.filter((event) => event.id !== id));
      emitEventsUpdated();
    } catch (e) {
      console.error("Failed to delete event", e);
      setError("Tapahtuman poisto epäonnistui");
    }
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEditTitle(event.title);
    setEditStart(new Date(event.start));
    setEditEnd(new Date(event.end));
  };

  const handleEditEventSave = async () => {
    if (!editingEvent) return;
    const trimmed = editTitle.trim();
    if (!trimmed || !editStart || !editEnd) return;

    try {
      setEditSaving(true);
      setError(null);
      const payload = {
        title: trimmed,
        start: editStart.toISOString(),
        end: editEnd.toISOString(),
        list: editingEvent.list ?? "Default",
      };
      const updated = await updateEventOnServer(editingEvent.id, payload);
      updateEventState(updated);
      setEditingEvent(null);
      emitEventsUpdated();
    } catch (e) {
      console.error("Failed to edit event", e);
      setError("Tapahtuman päivitys epäonnistui");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Stack>
      <Text fw={600} fz="lg">
        Kalenteri
      </Text>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card withBorder radius="md">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <ActionIcon
                  variant="subtle"
                  aria-label="Edellinen kuukausi"
                  onClick={() => setCurrentMonth((prev) => prev.subtract(1, "month"))}
                >
                  <IconChevronLeft size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  aria-label="Seuraava kuukausi"
                  onClick={() => setCurrentMonth((prev) => prev.add(1, "month"))}
                >
                  <IconChevronRight size={16} />
                </ActionIcon>
                <Text fw={500}>{currentMonth.format("MMMM YYYY")}</Text>
              </Group>
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={goToToday}>
                  Tänään
                </Button>
                <Button size="xs" variant="subtle" onClick={() => void fetchEvents()}>
                  Päivitä
                </Button>
              </Group>
            </Group>
            <Stack gap={4}>
              <Group gap={0} grow>
                {weekdayLabels.map((label) => (
                  <Text key={label} fz="xs" fw={500} ta="center">
                    {label}
                  </Text>
                ))}
              </Group>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: 6,
                }}
              >
                {calendarDays.map((day) => {
                  const key = day.format("YYYY-MM-DD");
                  const isCurrent = day.isSame(currentMonth, "month");
                  const isSelected = selectedDayKey
                    ? day.isSame(dayjs(selectedDayKey), "day")
                    : false;
                  const isToday = day.isSame(dayjs(), "day");
                  const dayEvents = eventsByDay[key] ?? [];
                  const previewEvents = dayEvents.slice(0, 3);
                  const remainingCount = Math.max(dayEvents.length - previewEvents.length, 0);

                  return (
                    <Paper
                      key={key}
                      withBorder
                      radius="md"
                      p={6}
                      style={{
                        cursor: "pointer",
                        borderColor: isToday
                          ? "var(--mantine-color-blue-filled)"
                          : undefined,
                        backgroundColor: isSelected
                          ? "var(--mantine-color-blue-light)"
                          : undefined,
                        opacity: isCurrent ? 1 : 0.4,
                        transition: "background-color 120ms ease",
                      }}
                      onClick={() => handleDayClick(day)}
                    >
                      <Stack gap={4} align="stretch">
                        <Group justify="space-between" gap={4} align="center">
                          <Text fz="sm" fw={500}>
                            {day.date()}
                          </Text>
                          {dayEvents.length > 0 && (
                            <Badge size="xs" variant="light" color="blue">
                              {dayEvents.length}
                            </Badge>
                          )}
                        </Group>
                        {previewEvents.length > 0 ? (
                          <Stack gap={2}>
                            {previewEvents.map((event) => (
                              <Text
                                key={`${event.id}-${key}`}
                                fz="10px"
                                lh={1.1}
                                truncate
                                title={`${event.title} (${dayjs(event.start).format("HH:mm")} → ${dayjs(event.end).format("HH:mm")})`}
                              >
                                {event.title}
                              </Text>
                            ))}
                            {remainingCount > 0 && (
                              <Text fz="10px" c="dimmed">
                                +{remainingCount} muuta
                              </Text>
                            )}
                          </Stack>
                        ) : (
                          <Text fz="10px" c="dimmed">
                            Ei tapahtumia
                          </Text>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </div>
            </Stack>
            <Text fz="sm" c="dimmed">
              Sininen merkki näyttää kuinka monta tapahtumaa kyseiselle päivälle on tallennettu.
            </Text>
          </Stack>
        </Card>

        <Card withBorder radius="md" mih={360}>
          <Stack gap="sm" h="100%">
            <Text fw={500}>
              {selectedDate
                ? dayjs(selectedDate).format("dddd D.M.YYYY")
                : "Valitse päivä kalenterista"}
            </Text>
            <Divider my="xs" />
            <ScrollArea h={260}
              offsetScrollbars
            >
              <Stack gap="xs">
                {selectedDate && selectedDayEvents.length === 0 && (
                  <Text fz="sm" c="dimmed">
                    Ei tapahtumia tälle päivälle.
                  </Text>
                )}

                {!selectedDate && (
                  <Text fz="sm" c="dimmed">
                    Valitse päivä nähdäksesi tapahtumat.
                  </Text>
                )}

                {selectedDayEvents.map((ev) => {
                  const startLabel = dayjs(ev.start).format("ddd D.M HH:mm");
                  const endLabel = dayjs(ev.end).format("ddd D.M HH:mm");
                  const startDay = dayjs(ev.start).startOf("day");
                  const endDay = dayjs(ev.end).startOf("day");
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
                      timingLabel = "Jatkuu koko päivän";
                    }
                  }

                  return (
                    <Card key={ev.id} withBorder radius="md">
                      <Stack gap={4}>
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                          <Stack gap={4} style={{ flex: 1 }}>
                            <Group gap="xs">
                              <Text fw={500}>{ev.title}</Text>
                              {ev.list && (
                                <Badge size="xs" variant="light" color="blue">
                                  {ev.list}
                                </Badge>
                              )}
                              {spansMultipleDays && (
                                <Badge size="xs" variant="dot" color="violet">
                                  Monipäiväinen
                                </Badge>
                              )}
                            </Group>
                            <Text fz="sm" c="dimmed">
                              {timingLabel}
                            </Text>
                            {spansMultipleDays && (
                              <Text fz="xs" c="dimmed">
                                {startLabel} → {endLabel}
                              </Text>
                            )}
                          </Stack>
                          <ActionIcon.Group>
                            <ActionIcon
                              variant="subtle"
                              aria-label="Muokkaa tapahtumaa"
                              onClick={() => openEditEvent(ev)}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              aria-label="Poista tapahtuma"
                              onClick={() => void handleDeleteEvent(ev.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </ActionIcon.Group>
                        </Group>
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            </ScrollArea>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Uusi tapahtuma */}
      <Card withBorder radius="md">
        <Stack gap="xs">
          <TextInput
            label="Tapahtuma"
            placeholder='Esim. "Koodiblokki AI-timeplanner-projektille"'
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <Group grow>
            <DateTimePicker
              label="Alkaa"
              value={start}
              onChange={(value) =>
                setStart(
                  value
                    ? typeof value === "string"
                      ? new Date(value)
                      : value
                    : null
                )
              }
              placeholder="pp.kk.vvvv hh:mm"
              valueFormat="DD.MM.YYYY HH:mm"
              leftSection={<IconClockHour4 size={16} stroke={1.5} />}
              radius="md"
              size="md"
              clearable
            />
            <DateTimePicker
              label="Päättyy"
              value={end}
              onChange={(value) =>
                setEnd(
                  value
                    ? typeof value === "string"
                      ? new Date(value)
                      : value
                    : null
                )
              }
              placeholder="pp.kk.vvvv hh:mm"
              valueFormat="DD.MM.YYYY HH:mm"
              leftSection={<IconClockHour4 size={16} stroke={1.5} />}
              radius="md"
              size="md"
              clearable
            />
          </Group>
          <Group justify="flex-end">
            <Button onClick={handleCreateEvent}>Lisää tapahtuma</Button>
          </Group>
        </Stack>
      </Card>

      {/* Tapahtumalista */}
      <Card withBorder radius="md">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={500}>Tapahtumat</Text>
            {loading && <Loader size="sm" />}
          </Group>

          {!loading && events.length === 0 && (
            <Text fz="sm" c="dimmed">
              Ei tapahtumia.
            </Text>
          )}

          {!loading &&
            events.map((ev) => (
              <Card key={ev.id} withBorder radius="md">
                <Stack gap={4}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Text fw={500}>{ev.title}</Text>
                      <Text fz="sm" c="dimmed">
                        {dayjs(ev.start).format("ddd D.M HH:mm")} → {dayjs(ev.end).format("ddd D.M HH:mm")}
                      </Text>
                      {ev.list && (
                        <Text fz="xs" c="dimmed">
                          Lista: {ev.list}
                        </Text>
                      )}
                    </Stack>
                    <ActionIcon.Group>
                      <ActionIcon
                        variant="subtle"
                        aria-label="Muokkaa tapahtumaa"
                        onClick={() => openEditEvent(ev)}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        aria-label="Poista tapahtuma"
                        onClick={() => void handleDeleteEvent(ev.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </ActionIcon.Group>
                  </Group>
                </Stack>
              </Card>
            ))}
        </Stack>
      </Card>

      <Modal
        opened={Boolean(editingEvent)}
        onClose={() => setEditingEvent(null)}
        title="Muokkaa tapahtumaa"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Tapahtuma"
            value={editTitle}
            onChange={(e) => setEditTitle(e.currentTarget.value)}
          />
          <Group grow>
            <DateTimePicker
              label="Alkaa"
              value={editStart}
              onChange={(value) =>
                setEditStart(
                  value
                    ? typeof value === "string"
                      ? new Date(value)
                      : value
                    : null
                )
              }
              placeholder="pp.kk.vvvv hh:mm"
              valueFormat="DD.MM.YYYY HH:mm"
              leftSection={<IconClockHour4 size={16} stroke={1.5} />}
              radius="md"
              size="md"
              clearable
            />
            <DateTimePicker
              label="Päättyy"
              value={editEnd}
              onChange={(value) =>
                setEditEnd(
                  value
                    ? typeof value === "string"
                      ? new Date(value)
                      : value
                    : null
                )
              }
              placeholder="pp.kk.vvvv hh:mm"
              valueFormat="DD.MM.YYYY HH:mm"
              leftSection={<IconClockHour4 size={16} stroke={1.5} />}
              radius="md"
              size="md"
              clearable
            />
          </Group>
          <Group justify="flex-end">
            <Button onClick={handleEditEventSave} loading={editSaving}>
              Tallenna muutokset
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
