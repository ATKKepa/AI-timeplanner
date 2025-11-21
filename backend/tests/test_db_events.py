import os
import copy

import pytest
import azure.cosmos  # type: ignore


class FakeEventsContainer:
    """Minimal in-memory stand-in for the Cosmos events container."""

    def __init__(self) -> None:
        self.items: dict[str, dict] = {}

    def create_item(self, item: dict) -> None:
        self.items[item["id"]] = copy.deepcopy(item)

    def query_items(self, query: str, parameters: list, enable_cross_partition_query: bool = False):
        user_id = next((p["value"] for p in parameters if p["name"] == "@userId"), None)
        start = next((p["value"] for p in parameters if p["name"] == "@start"), None)
        end = next((p["value"] for p in parameters if p["name"] == "@end"), None)
        title = next((p["value"].lower() for p in parameters if p["name"] == "@title"), None)

        results: list[dict] = []
        for item in self.items.values():
            if user_id and item.get("userId") != user_id:
                continue
            if start and item.get("start") < start:
                continue
            if end and item.get("start") >= end:
                continue
            if title is not None:
                current = (item.get("title") or "").lower()
                if "CONTAINS" in query.upper():
                    if title not in current:
                        continue
                else:
                    if current != title:
                        continue
            results.append(copy.deepcopy(item))

        reverse = "ORDER BY C.START DESC" in query.upper()
        results.sort(key=lambda ev: ev.get("start") or "", reverse=reverse)
        return results

    def read_item(self, item_id: str, partition_key: str) -> dict:
        return copy.deepcopy(self.items[item_id])

    def replace_item(self, item_id: str, item: dict) -> None:
        self.items[item_id] = copy.deepcopy(item)

    def delete_item(self, item_id: str, partition_key: str) -> None:
        self.items.pop(item_id, None)


class _StubCosmosClient:
    """Prevents outbound calls during module import."""

    def __init__(self, *args, **kwargs) -> None:
        self._container = FakeEventsContainer()

    def get_database_client(self, name):
        return self

    def get_container_client(self, name):
        return self._container


os.environ.setdefault("COSMOSDB_ENDPOINT", "https://localhost:8081")
os.environ.setdefault("COSMOSDB_KEY", "ZmFrZS1rZXk=")
os.environ.setdefault("COSMOSDB_DATABASE", "test-db")
os.environ.setdefault("COSMOSDB_EVENTS_CONTAINER", "events")

azure.cosmos.CosmosClient = _StubCosmosClient

from backend import db_events


@pytest.fixture(autouse=True)
def fake_container(monkeypatch):
    container = FakeEventsContainer()
    monkeypatch.setattr(db_events, "_events_container", container)
    return container


def test_create_event_sets_fields(fake_container):
    event = db_events.create_event(
        user_id="user1",
        title="Meeting",
        start_iso="2024-01-01T10:00:00Z",
        end_iso="2024-01-01T11:00:00Z",
        list_name="Work",
    )

    stored = fake_container.items[event["id"]]
    assert stored["userId"] == "user1"
    assert stored["title"] == "Meeting"
    assert stored["start"] == "2024-01-01T10:00:00Z"
    assert stored["end"] == "2024-01-01T11:00:00Z"
    assert stored["list"] == "Work"
    assert "createdAt" in stored


def test_list_events_filters_by_range(fake_container):
    fake_container.create_item({
        "id": "1",
        "userId": "user1",
        "title": "Before",
        "start": "2024-01-01T08:00:00Z",
        "end": "2024-01-01T09:00:00Z",
        "list": "Default",
    })
    fake_container.create_item({
        "id": "2",
        "userId": "user1",
        "title": "Inside window",
        "start": "2024-01-01T10:00:00Z",
        "end": "2024-01-01T11:00:00Z",
        "list": "Default",
    })
    fake_container.create_item({
        "id": "3",
        "userId": "user1",
        "title": "After",
        "start": "2024-01-01T12:00:00Z",
        "end": "2024-01-01T13:00:00Z",
        "list": "Default",
    })
    fake_container.create_item({
        "id": "4",
        "userId": "other",
        "title": "Other user",
        "start": "2024-01-01T10:30:00Z",
        "end": "2024-01-01T11:30:00Z",
        "list": "Default",
    })

    results = db_events.list_events(
        user_id="user1",
        start_iso="2024-01-01T09:30:00Z",
        end_iso="2024-01-01T12:00:00Z",
    )

    assert [event["id"] for event in results] == ["2"]


def test_delete_events_in_range_removes_only_matches(fake_container):
    inside = {
        "id": "5",
        "userId": "user1",
        "title": "Inside",
        "start": "2024-01-02T10:00:00Z",
        "end": "2024-01-02T11:00:00Z",
        "list": "Default",
    }
    outside = {
        "id": "6",
        "userId": "user1",
        "title": "Outside",
        "start": "2024-01-02T12:00:00Z",
        "end": "2024-01-02T13:00:00Z",
        "list": "Default",
    }
    fake_container.create_item(inside)
    fake_container.create_item(outside)

    deleted = db_events.delete_events_in_range(
        user_id="user1",
        start_iso="2024-01-02T09:30:00Z",
        end_iso="2024-01-02T11:30:00Z",
    )

    assert [event["id"] for event in deleted] == ["5"]
    assert "5" not in fake_container.items
    assert "6" in fake_container.items


def test_find_events_by_title(fake_container):
    exact = {
        "id": "7",
        "userId": "user1",
        "title": "Team Meeting",
        "start": "2024-01-03T09:00:00Z",
        "end": "2024-01-03T10:00:00Z",
        "list": "Default",
    }
    partial = {
        "id": "8",
        "userId": "user1",
        "title": "Weekly team sync",
        "start": "2024-01-04T09:00:00Z",
        "end": "2024-01-04T10:00:00Z",
        "list": "Default",
    }
    fake_container.create_item(exact)
    fake_container.create_item(partial)

    matches = db_events.find_events_by_title("user1", "team meeting")
    assert [event["id"] for event in matches] == ["7"]

    partial_matches = db_events.find_events_by_title("user1", "team")
    assert {event["id"] for event in partial_matches} == {"7", "8"}


