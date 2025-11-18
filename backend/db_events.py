import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from azure.cosmos import CosmosClient

COSMOS_ENDPOINT = os.environ["COSMOSDB_ENDPOINT"]
COSMOS_KEY = os.environ["COSMOSDB_KEY"]
COSMOS_DB_NAME = os.environ["COSMOSDB_DATABASE"]
COSMOS_EVENTS_CONTAINER = "events"

_client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
_db = _client.get_database_client(COSMOS_DB_NAME)
_events_container = _db.get_container_client(COSMOS_EVENTS_CONTAINER)


def list_events(
    user_id: str,
    start_iso: Optional[str] = None,
    end_iso: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if start_iso and end_iso:
        query = (
            "SELECT * FROM c "
            "WHERE c.userId = @userId "
            "AND c.start >= @start "
            "AND c.start < @end "
            "ORDER BY c.start ASC"
        )
        params = [
            {"name": "@userId", "value": user_id},
            {"name": "@start", "value": start_iso},
            {"name": "@end", "value": end_iso},
        ]
    else:
        query = (
            "SELECT * FROM c "
            "WHERE c.userId = @userId "
            "ORDER BY c.start ASC"
        )
        params = [{"name": "@userId", "value": user_id}]

    items = list(
        _events_container.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=False,
        )
    )
    return items


def create_event(
    user_id: str,
    title: str,
    start_iso: str,
    end_iso: str,
    list_name: str = "Default",
) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()

    event = {
        "id": str(uuid.uuid4()),
        "userId": user_id,
        "title": title,
        "start": start_iso,
        "end": end_iso,
        "list": list_name,
        "createdAt": now_iso,
    }

    _events_container.create_item(event)
    return event


def delete_event(user_id: str, event_id: str) -> None:
    _events_container.delete_item(event_id, partition_key=user_id)


def find_events_by_title(user_id: str, title: str) -> List[Dict[str, Any]]:
    normalized = title.strip().lower()
    if not normalized:
        return []

    exact_query = (
        "SELECT * FROM c WHERE c.userId = @userId AND LOWER(c.title) = @title "
        "ORDER BY c.start DESC"
    )
    params = [
        {"name": "@userId", "value": user_id},
        {"name": "@title", "value": normalized},
    ]

    items = list(
        _events_container.query_items(
            query=exact_query,
            parameters=params,
            enable_cross_partition_query=False,
        )
    )
    if items:
        return items

    partial_query = (
        "SELECT * FROM c WHERE c.userId = @userId AND CONTAINS(LOWER(c.title), @title) "
        "ORDER BY c.start DESC"
    )
    partial_params = [
        {"name": "@userId", "value": user_id},
        {"name": "@title", "value": normalized},
    ]

    items = list(
        _events_container.query_items(
            query=partial_query,
            parameters=partial_params,
            enable_cross_partition_query=False,
        )
    )
    return items


def update_event(user_id: str, event_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    if not updates:
        return _events_container.read_item(event_id, partition_key=user_id)

    item = _events_container.read_item(event_id, partition_key=user_id)

    for key in ["title", "start", "end", "list"]:
        if key in updates and updates[key] is not None:
            item[key] = updates[key]

    _events_container.replace_item(event_id, item)
    return item


def delete_events_in_range(user_id: str, start_iso: str, end_iso: str) -> List[Dict[str, Any]]:
    to_delete = list_events(user_id=user_id, start_iso=start_iso, end_iso=end_iso)
    for event in to_delete:
        _events_container.delete_item(event["id"], partition_key=user_id)
    return to_delete
