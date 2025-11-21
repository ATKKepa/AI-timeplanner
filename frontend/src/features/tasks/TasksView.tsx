import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";
import dayjs from "dayjs";
import type { Task } from "./types";
import { normalizeTask, parseTaskPayload, parseTasksResponse } from "./taskApi";
import { TaskItem } from "./TaskItem";
import { emitTasksUpdated } from "../../utils/dataRefresh";

const TASK_LISTS: Array<"Inbox" | "Work" | "Personal"> = [
  "Inbox",
  "Work",
  "Personal",
];

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [list, setList] = useState<"Inbox" | "Work" | "Personal">("Inbox");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editList, setEditList] = useState<"Inbox" | "Work" | "Personal">("Inbox");
  const [editDueDate, setEditDueDate] = useState<Date | null>(null);
  const [editStatus, setEditStatus] = useState<"open" | "done">("open");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/tasks");
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const payload: unknown = await res.json();
        const apiTasks = parseTasksResponse(payload);
        setTasks(apiTasks.map(normalizeTask));
      } catch (error: unknown) {
        console.error("Failed to fetch tasks", error);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const responseData: unknown = await res.json();
      const newTask = normalizeTask(parseTaskPayload(responseData));
      setTasks((prev) => [newTask, ...prev]);
      setTitle("");
      setDueDate(null);
      emitTasksUpdated();
    } catch (error: unknown) {
      console.error("Failed to create task", error);
      setError("Tehtävän luonti epäonnistui");
    } finally {
      setSaving(false);
    }
  };

  const updateTaskOnServer = async (
    id: string,
    payload: Record<string, unknown>
  ) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const responseData: unknown = await res.json();
    return normalizeTask(parseTaskPayload(responseData));
  };

  const updateTaskState = (updated: Task) => {
    setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)));
  };

  const handleToggleStatus = async (id: string) => {
    const target = tasks.find((task) => task.id === id);
    if (!target) return;
    const nextStatus = target.status === "open" ? "done" : "open";

    try {
      setError(null);
      const updated = await updateTaskOnServer(id, { status: nextStatus });
      updateTaskState(updated);
      emitTasksUpdated();
    } catch (error: unknown) {
      console.error("Failed to toggle task", error);
      setError("Tehtävän päivitys epäonnistui");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      setTasks((prev) => prev.filter((task) => task.id !== id));
      emitTasksUpdated();
    } catch (error: unknown) {
      console.error("Failed to delete task", error);
      setError("Tehtävän poisto epäonnistui");
    }
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditList(task.list);
    setEditStatus(task.status);
    setEditDueDate(task.dueDate ? new Date(task.dueDate) : null);
  };

  const handleEditSave = async () => {
    if (!editingTask) return;
    const trimmed = editTitle.trim();
    if (!trimmed) return;

    try {
      setEditSaving(true);
      setError(null);
      const payload = {
        title: trimmed,
        list: editList,
        status: editStatus,
        dueDate: editDueDate ? editDueDate.toISOString() : null,
      };
      const updated = await updateTaskOnServer(editingTask.id, payload);
      updateTaskState(updated);
      setEditingTask(null);
      emitTasksUpdated();
    } catch (error: unknown) {
      console.error("Failed to edit task", error);
      setError("Tehtävän muokkaus epäonnistui");
    } finally {
      setEditSaving(false);
    }
  };

  const openTasks = tasks.filter((task) => task.status === "open");
  const doneTasks = tasks.filter((task) => task.status === "done");

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
              data={TASK_LISTS}
              value={list}
              onChange={(value) =>
                setList((value as "Inbox" | "Work" | "Personal") ?? "Inbox")
              }
            />
            <DateInput
              label="Eräpäivä"
              value={dueDate}
              onChange={(val) => setDueDate(val ? new Date(val) : null)}
              valueFormat="DD.MM.YYYY"
              placeholder="pp.kk.vvvv"
              leftSection={<IconCalendar size={16} stroke={1.5} />}
              radius="md"
              size="md"
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
                onEdit={openEditTask}
              />
            ))}
        </Stack>
      </Card>

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
                onEdit={openEditTask}
              />
            ))}
          </Stack>
        </Card>
      )}

      <Modal
        opened={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        title="Muokkaa tehtävää"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Otsikko"
            value={editTitle}
            onChange={(e) => setEditTitle(e.currentTarget.value)}
          />
          <Group grow>
            <Select
              label="Lista"
              data={TASK_LISTS}
              value={editList}
              onChange={(value) =>
                setEditList((value as "Inbox" | "Work" | "Personal") ?? "Inbox")
              }
            />
            <Select
              label="Tila"
              data={[
                { value: "open", label: "Avoin" },
                { value: "done", label: "Valmis" },
              ]}
              value={editStatus}
              onChange={(value) =>
                setEditStatus((value as "open" | "done") ?? "open")
              }
            />
          </Group>
          <DateInput
            label="Eräpäivä"
            value={editDueDate}
            onChange={(val) => setEditDueDate(val ? new Date(val) : null)}
            valueFormat="DD.MM.YYYY"
            placeholder="pp.kk.vvvv"
            leftSection={<IconCalendar size={16} stroke={1.5} />}
            radius="md"
            size="md"
            clearable
          />
          <Group justify="flex-end">
            <Button onClick={handleEditSave} loading={editSaving}>
              Tallenna muutokset
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
