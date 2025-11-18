import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Loader,
  Alert,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import dayjs from "dayjs";
import type { Task } from "./types";
import { TaskItem } from "./TaskItem";

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [list, setList] = useState<"Inbox" | "Work" | "Personal">("Inbox");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hae tehtävät backendistä mountissa
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/tasks");
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const data = await res.json();

        const apiTasks = (data.tasks ?? []) as any[];

        const mapped: Task[] = apiTasks.map((t) => ({
          id: String(t.id),
          title: String(t.title),
          list: (t.list as "Inbox" | "Work" | "Personal") ?? "Inbox",
          status: (t.status as "open" | "done") ?? "open",
          createdAt: String(t.createdAt ?? new Date().toISOString()),
          dueDate: t.dueDate ? String(t.dueDate) : undefined,
        }));

        setTasks(mapped);
      } catch (e: any) {
        console.error("Failed to fetch tasks", e);
        setError("Tehtävien haku epäonnistui");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  const handleAddTask = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    try {
      setSaving(true);
      setError(null);

      const body = {
        title: trimmed,
        list,
        dueDate: dueDate ? dueDate.toISOString() : null,
      };

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();

      const newTask: Task = {
        id: String(data.id),
        title: String(data.title),
        list: (data.list as "Inbox" | "Work" | "Personal") ?? "Inbox",
        status: (data.status as "open" | "done") ?? "open",
        createdAt: String(data.createdAt ?? new Date().toISOString()),
        dueDate: data.dueDate ? String(data.dueDate) : undefined,
      };

      setTasks((prev) => [newTask, ...prev]);
      setTitle("");
      setDueDate(null);
    } catch (e: any) {
      console.error("Failed to create task", e);
      setError("Tehtävän luonti epäonnistui");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = (id: string) => {
    // Toistaiseksi vain lokaalisti – myöhemmin API-kutsut
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "open" ? "done" : "open" }
          : t
      )
    );
  };

  const handleDelete = (id: string) => {
    // Toistaiseksi vain lokaalisti – myöhemmin API-kutsu
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const openTasks = tasks.filter((t) => t.status === "open");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <Stack>
      <Text fw={600} fz="lg">
        Tehtävälista
      </Text>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

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
              data={["Inbox", "Work", "Personal"]}
              value={list}
              onChange={(value) =>
                setList((value as "Inbox" | "Work" | "Personal") ?? "Inbox")
              }
            />
            <DateInput
              label="Eräpäivä"
              value={dueDate}
              onChange={(val) =>
                setDueDate(val ? dayjs(val, "DD.MM.YYYY").toDate() : null)
              }
              valueFormat="DD.MM.YYYY"
              clearable
              minDate={dayjs().toDate()}
            />
          </Group>
          <Group justify="flex-end">
            <Button onClick={handleAddTask} disabled={saving}>
              {saving ? "Tallennetaan..." : "Lisää tehtävä"}
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Avoimet tehtävät */}
      <Card withBorder radius="md">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={500}>Avoimet</Text>
            {loading && <Loader size="sm" />}
          </Group>

          {!loading && openTasks.length === 0 && (
            <Text fz="sm" c="dimmed">
              Ei avoimia tehtäviä.
            </Text>
          )}

          {!loading &&
            openTasks.map((task) => (
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
