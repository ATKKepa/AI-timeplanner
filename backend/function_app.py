import json
from datetime import datetime, timezone
import logging
import azure.functions as func

app = func.FunctionApp()

@app.route(route="health", auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps({
            "status": "ok",
            "service": "ai-timeplanner-backend",
            "time": datetime.now(timezone.utc).isoformat(),
        }),
        mimetype="application/json",
        status_code=200,
    )

MOCK_TASKS = [
    {
        "id": "1",
        "title": "Luo Azure-tili ja tarkista krediitit",
        "list": "Inbox",
        "status": "open",
        "createdAt": "2025-01-01T10:00:00Z",
    },
    {
        "id": "2",
        "title": "Rakennetaan AI Timeplannerin chat-UI",
        "list": "Work",
        "status": "open",
        "createdAt": "2025-01-02T12:00:00Z",
    },
]

@app.route(route="tasks", methods=["GET", "POST"], auth_level=func.AuthLevel.ANONYMOUS)
def tasks(req: func.HttpRequest) -> func.HttpResponse:
    method = req.method.upper()

    if method == "GET":
        return func.HttpResponse(
            body=json.dumps({"tasks": MOCK_TASKS}),
            mimetype="application/json",
            status_code=200,
        )

    if method == "POST":
        try:
            data = req.get_json()
        except ValueError:
            return func.HttpResponse(
                body=json.dumps({"error": "Invalid JSON"}),
                mimetype="application/json",
                status_code=400,
            )

        title = (data.get("title") or "").strip()
        list_name = data.get("list") or "Inbox"

        if not title:
            return func.HttpResponse(
                body=json.dumps({"error": "title is required"}),
                mimetype="application/json",
                status_code=400,
            )

        new_task = {
            "id": datetime.now(timezone.utc).isoformat(),
            "title": title,
            "list": list_name,
            "status": "open",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        MOCK_TASKS.insert(0, new_task)

        return func.HttpResponse(
            body=json.dumps(new_task),
            mimetype="application/json",
            status_code=201,
        )

    return func.HttpResponse(
        body=json.dumps({"error": "Method not allowed"}),
        mimetype="application/json",
        status_code=405,
    )

@app.route(route="chat", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def chat(req: func.HttpRequest) -> func.HttpResponse:
    try:
        data = req.get_json()
    except ValueError:
        return func.HttpResponse(
            body=json.dumps({"error": "Invalid JSON"}),
            mimetype="application/json",
            status_code=400,
        )

    message = (data.get("message") or "").strip()

    if not message:
        return func.HttpResponse(
            body=json.dumps({"error": "message is required"}),
            mimetype="application/json",
            status_code=400,
        )

    # Tässä kohtaa myöhemmin:
    #  - Azure OpenAI -kutsu
    #  - mahdolliset tool-callit (create_task, create_event, ...)
    reply = f"Sait viestin: {message}"

    return func.HttpResponse(
        body=json.dumps(
            {
                "reply": reply,
                "echo": True,
                "receivedAt": datetime.now(timezone.utc).isoformat(),
            }
        ),
        mimetype="application/json",
        status_code=200,
    )
