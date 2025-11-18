import os
import json
from datetime import datetime, timezone
import logging

import azure.functions as func
from openai import AzureOpenAI

from db import list_tasks as db_list_tasks, create_task as db_create_task


app = func.FunctionApp()

azure_openai_client = AzureOpenAI(
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version=os.environ["AZURE_OPENAI_API_VERSION"],
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
)

AZURE_OPENAI_MODEL = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME")

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

    # TODO: myöhemmin oikea userId authista
    user_id = "demo-user"

    if method == "GET":
        try:
            items = db_list_tasks(user_id)
            return func.HttpResponse(
                body=json.dumps({"tasks": items}),
                mimetype="application/json",
                status_code=200,
            )
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to list tasks", "details": str(e)}),
                mimetype="application/json",
                status_code=500,
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
        due_date = data.get("dueDate")  # ISO string tai None

        if not title:
            return func.HttpResponse(
                body=json.dumps({"error": "title is required"}),
                mimetype="application/json",
                status_code=400,
            )

        try:
            task = db_create_task(user_id=user_id, title=title, list_name=list_name, due_date=due_date)
            return func.HttpResponse(
                body=json.dumps(task),
                mimetype="application/json",
                status_code=201,
            )
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to create task", "details": str(e)}),
                mimetype="application/json",
                status_code=500,
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

    try:
        # Perus system-prompt: ajan­hallinnan assistentti, oletuskieli suomi
        messages = [
            {
                "role": "system",
                "content": (
                    "Olet ajan- ja tehtävänhallinnan AI-assistentti. "
                    "Ymmärrät suomea ja englantia, mutta vastaat oletuksena suomeksi. "
                    "Autat käyttäjää suunnittelemaan päivän, viikkonäkymän ja tehtävät."
                ),
            },
            {"role": "user", "content": message},
        ]

        completion = azure_openai_client.chat.completions.create(
            model=AZURE_OPENAI_MODEL,  # tämä on deploymentin nimi
            messages=messages,
            max_tokens=400,
            temperature=0.3,
        )

        reply = completion.choices[0].message.content

        return func.HttpResponse(
            body=json.dumps(
                {
                    "reply": reply,
                    "model": AZURE_OPENAI_MODEL,
                    "receivedAt": datetime.now(timezone.utc).isoformat(),
                }
            ),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        # yksinkertainen virheenkäsittely dev-vaiheeseen
        return func.HttpResponse(
            body=json.dumps({"error": "OpenAI call failed", "details": str(e)}),
            mimetype="application/json",
            status_code=500,
        )
