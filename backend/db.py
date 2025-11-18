import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from azure.cosmos import CosmosClient

COSMOS_ENDPOINT = os.environ["COSMOSDB_ENDPOINT"]
COSMOS_KEY = os.environ["COSMOSDB_KEY"]
COSMOS_DB_NAME = os.environ["COSMOSDB_DATABASE"]
COSMOS_TASKS_CONTAINER = os.environ["COSMOSDB_TASKS_CONTAINER"]

_client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
_db = _client.get_database_client(COSMOS_DB_NAME)
_tasks_container = _db.get_container_client(COSMOS_TASKS_CONTAINER)


def list_tasks(user_id: str) -> List[Dict[str, Any]]:
    query = "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC"
    params = [{"name": "@userId", "value": user_id}]
    items = list(
        _tasks_container.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=False,
        )
    )
    return items


def create_task(
    user_id: str,
    title: str,
    list_name: str,
    due_date: str | None,
) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()

    task = {
        "id": str(uuid.uuid4()),
        "userId": user_id,
        "title": title,
        "list": list_name,
        "status": "open",
        "createdAt": now_iso,
        "dueDate": due_date,
    }

    _tasks_container.create_item(task)
    return task
