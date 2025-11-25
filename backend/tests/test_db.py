import os
import copy

import pytest
import azure.cosmos  # type: ignore


class FakeTasksContainer:
    """Minimal in-memory stand-in for the Cosmos container."""

    def __init__(self) -> None:
        self.items: dict[str, dict] = {}

    def create_item(self, item: dict) -> None:
        self.items[item["id"]] = copy.deepcopy(item)

    def query_items(self, query: str, parameters: list, enable_cross_partition_query: bool = False):
        params = {param["name"]: param["value"] for param in parameters}
        user_id = params.get("@userId")
        list_name = params.get("@list")
        title = params.get("@title")

        results: list[dict] = []
        for item in self.items.values():
            if user_id and item.get("userId") != user_id:
                continue
            if list_name and item.get("list") != list_name:
                continue
            if title is not None:
                current = (item.get("title") or "").lower()
                if current != title:
                    continue
            results.append(copy.deepcopy(item))

        reverse = "ORDER BY C.CREATEDAT DESC" in query.upper()
        results.sort(key=lambda entry: entry.get("createdAt") or "", reverse=reverse)
        return results

    def read_item(self, item_id: str, partition_key: str) -> dict:
        return copy.deepcopy(self.items[item_id])

    def replace_item(self, item_id: str, item: dict) -> None:
        self.items[item_id] = copy.deepcopy(item)

    def delete_item(self, item_id: str, partition_key: str) -> None:
        self.items.pop(item_id, None)


class _StubCosmosClient:
    """Prevents outbound calls during module import time."""

    def __init__(self, *args, **kwargs) -> None:
        self._container = FakeTasksContainer()

    def get_database_client(self, name):  
        return self

    def get_container_client(self, name):
        return self._container


azure.cosmos.CosmosClient = _StubCosmosClient

os.environ.setdefault("COSMOSDB_ENDPOINT", "https://localhost:8081")
os.environ.setdefault("COSMOSDB_KEY", "ZmFrZS1rZXk=")
os.environ.setdefault("COSMOSDB_DATABASE", "test-db")
os.environ.setdefault("COSMOSDB_TASKS_CONTAINER", "tasks")

from backend import db


@pytest.fixture(autouse=True)
def fake_container(monkeypatch):
    container = FakeTasksContainer()
    monkeypatch.setattr(db, "_tasks_container", container)
    return container


def test_create_task_persists_defaults(fake_container):
    task = db.create_task(
        user_id="user-1",
        title="Write backend tests",
        list_name="Inbox",
        due_date=None,
    )

    stored = fake_container.items[task["id"]]
    assert stored["userId"] == "user-1"
    assert stored["status"] == "open"
    assert stored["title"] == "Write backend tests"
    assert stored["list"] == "Inbox"
    assert stored["dueDate"] is None


def test_update_task_can_clear_due_date(fake_container):
    seed = db.create_task(
        user_id="user-2",
        title="Prepare demo",
        list_name="Work",
        due_date="2025-11-25T12:00:00Z",
    )

    updated = db.update_task(user_id="user-2", task_id=seed["id"], updates={"dueDate": None})

    assert "dueDate" not in updated
    assert "dueDate" not in fake_container.items[seed["id"]]

def test_delete_task_for_user(fake_container):

    task1 = db.create_task(
        user_id="user-3",
        title="Task 1",
        list_name="List A",
        due_date=None,
    )

    task2 = db.create_task(
        user_id="user-3",
        title="Task 2",
        list_name="List A",
        due_date=None,
    )
    task3 = db.create_task(
        user_id="user-3",
        title="Task 3",
        list_name="List B",
        due_date=None,
    )

    deleted_tasks = db.delete_tasks_for_user(user_id="user-3", list_name="List A")
    assert len(deleted_tasks) == 2
    assert task1["id"] not in fake_container.items
    assert task2["id"] not in fake_container.items
    assert task3["id"] in fake_container.items

def test_list_tasks_returns_user_items_sorted(fake_container):
    task1 = db.create_task(user_id="user-4", title="First", list_name="Inbox", due_date=None)
    task2 = db.create_task(user_id="user-4", title="Second", list_name="Inbox", due_date=None)
    other = db.create_task(user_id="someone-else", title="Skip me", list_name="Inbox", due_date=None)

    fake_container.items[task1["id"]]["createdAt"] = "2025-01-01T10:00:00Z"
    fake_container.items[task2["id"]]["createdAt"] = "2025-01-02T10:00:00Z"
    fake_container.items[other["id"]]["createdAt"] = "2025-01-03T10:00:00Z"

    results = db.list_tasks("user-4")
    assert [task["id"] for task in results] == [task2["id"], task1["id"]]
