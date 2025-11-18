import os
import json
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import logging
from typing import Any

import azure.functions as func # type: ignore
from openai import AzureOpenAI

from db import (
    list_tasks as db_list_tasks,
    create_task as db_create_task,
    delete_task as db_delete_task,
    find_tasks_by_title as db_find_tasks_by_title,
    update_task as db_update_task,
    delete_tasks_for_user as db_delete_tasks_for_user,
)
from db_events import (
    list_events as db_list_events,
    create_event as db_create_event,
    delete_event as db_delete_event,
    find_events_by_title as db_find_events_by_title,
    update_event as db_update_event,
    delete_events_in_range as db_delete_events_in_range,
)



app = func.FunctionApp()

# ----------------- Azure OpenAI setup -----------------
AZURE_OPENAI_ENDPOINT = os.environ["AZURE_OPENAI_ENDPOINT"]
AZURE_OPENAI_API_KEY = os.environ["AZURE_OPENAI_API_KEY"]
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-01")
AZURE_OPENAI_MODEL = os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"]

azure_openai_client = AzureOpenAI(
    api_key=AZURE_OPENAI_API_KEY,
    api_version=AZURE_OPENAI_API_VERSION,
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
)

# Yksinkertainen käyttäjä-id devivaiheeseen
DEMO_USER_ID = "demo-user"

# Toolien määrittely OpenAI:lle
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": (
                "Luo uuden tehtävän käyttäjän tehtävälistalle ja aseta se oikeaan listaan "
                "(Inbox, Work tai Personal) ja tarvittaessa eräpäivä."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Tehtävän otsikko, lyhyt kuvaus mitä pitää tehdä.",
                    },
                    "list": {
                        "type": "string",
                        "description": "Mille listalle tehtävä kuuluu: Inbox, Work tai Personal.",
                        "enum": ["Inbox", "Work", "Personal"],
                    },
                    "dueDate": {
                        "type": "string",
                        "description": (
                            "Eräpäivä ISO 8601 -muodossa (esim. 2025-11-19T18:00:00Z) "
                            "tai tyhjä merkkijono jos käyttäjä ei antanut päivää."
                        ),
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Poista olemassa oleva tehtävä käyttäjän tehtävälistalta id:n perusteella.",
            "parameters": {
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "Poistettavan tehtävän id.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Tehtävän otsikko, jos id:tä ei tiedetä.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_tasks_in_list",
            "description": (
                "Poista kaikki käyttäjän tehtävät tietyltä listalta tai kaikista listoista, "
                "kun käyttäjä pyytää esim. 'poista kaikki tehtävät' tai 'tyhjennä Work-lista'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "list": {
                        "type": "string",
                        "description": "Lista, jonka tehtävät poistetaan. Jos puuttuu, poistetaan kaikki listat.",
                        "enum": ["Inbox", "Work", "Personal"],
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_event",
            "description": (
                "Luo kalenteriin tapahtuman annetulla otsikolla ja aikaikkunalla. "
                "Käytä tätä, kun käyttäjä puhuu palavereista, koodiblokeista tai muista ajastetuista asioista."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Tapahtuman otsikko, esim. 'koodiblokki AI-projektille'.",
                    },
                    "start": {
                        "type": "string",
                        "description": (
                            "Tapahtuman alkuaika ISO 8601 -muodossa, "
                            "esim. 2025-11-19T12:00:00+02:00. "
                            "Oleta käyttäjän aikavyöhykkeeksi Europe/Helsinki."
                        ),
                    },
                    "end": {
                        "type": "string",
                        "description": (
                            "Tapahtuman loppuaika ISO 8601 -muodossa, "
                            "esim. 2025-11-19T14:00:00+02:00."
                        ),
                    },
                    "list": {
                        "type": "string",
                        "description": "Kalenterilista tai kategoria, esim. Work, Personal tms.",
                    },
                },
                "required": ["title", "start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_event",
            "description": "Poista olemassa oleva kalenteritapahtuma id:n perusteella.",
            "parameters": {
                "type": "object",
                "properties": {
                    "eventId": {
                        "type": "string",
                        "description": "Poistettavan tapahtuman id.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Tapahtuman otsikko, jos id:tä ei tiedetä.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_events_in_range",
            "description": (
                "Poista kaikki tapahtumat, jotka alkavat annetun aikavälin sisällä. "
                "Käytä tätä, kun käyttäjä pyytää poistamaan kaikki tietyn päivän tai ajanjakson tapahtumat."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {
                        "type": "string",
                        "description": "Aikavälin alkuaika ISO 8601 -muodossa (Europe/Helsinki).",
                    },
                    "end": {
                        "type": "string",
                        "description": "Aikavälin loppuaika ISO 8601 -muodossa (exclusive).",
                    },
                    "label": {
                        "type": "string",
                        "description": "Vapaa kuvaus aikavälistä, esim. 'huomenna', käyttäjälle vastausta varten.",
                    },
                },
                "required": ["start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": (
                "Päivitä olemassa olevan tehtävän tietoja. Voit muokata otsikkoa, listaa, due datea tai tilaa."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "Muokattavan tehtävän id. Jos ei saatavilla, anna matchTitle."
                    },
                    "matchTitle": {
                        "type": "string",
                        "description": "Tehtävän otsikko, jota vasten etsitään jos id:tä ei tiedetä."
                    },
                    "title": {
                        "type": "string",
                        "description": "Uusi otsikko."
                    },
                    "list": {
                        "type": "string",
                        "description": "Uusi lista (Inbox, Work, Personal)."
                    },
                    "dueDate": {
                        "type": "string",
                        "description": "Uusi eräpäivä ISO 8601 -muodossa tai tyhjä merkkijono jos halutaan poistaa."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["open", "done"],
                        "description": "Uusi tila."
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_event",
            "description": (
                "Päivitä olemassa olevan kalenteritapahtuman tietoja (otsikko, alkamis- ja päättymisaika, lista)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "eventId": {
                        "type": "string",
                        "description": "Muokattavan tapahtuman id. Jos ei saatavilla, anna matchTitle."
                    },
                    "matchTitle": {
                        "type": "string",
                        "description": "Tapahtuman otsikko, jota käytetään haussa jos id puuttuu."
                    },
                    "title": {
                        "type": "string",
                        "description": "Uusi otsikko."
                    },
                    "start": {
                        "type": "string",
                        "description": "Uusi alkuaika ISO 8601 -muodossa."
                    },
                    "end": {
                        "type": "string",
                        "description": "Uusi loppuaika ISO 8601 -muodossa."
                    },
                    "list": {
                        "type": "string",
                        "description": "Uusi listan/kategorian nimi."
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_tasks_overview",
            "description": (
                "Hae käyttäjän tehtävät listattavaksi. Käytä tätä kun käyttäjä pyytää 'näytä kaikki tehtävät', "
                "'mitä työlistalla on' tai muita yhteenvetoja. Voit suodattaa listan tai tilan mukaan ja "
                "rajata kappalemäärää."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "list": {
                        "type": "string",
                        "description": "Rajoita tiettyyn listaan (Inbox, Work tai Personal).",
                        "enum": ["Inbox", "Work", "Personal"],
                    },
                    "status": {
                        "type": "string",
                        "description": "Rajoita avoimiin (open) tai valmiisiin (done) tehtäviin.",
                        "enum": ["open", "done"],
                    },
                    "dueAfter": {
                        "type": "string",
                        "description": "Ota mukaan vain tehtävät joilla on eräpäivä tämän ajan jälkeen (ISO 8601).",
                    },
                    "dueBefore": {
                        "type": "string",
                        "description": "Ota mukaan vain tehtävät joiden eräpäivä on ennen tätä (ISO 8601).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Montako tehtävää palautetaan enintään (1-50).",
                        "minimum": 1,
                        "maximum": 50,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_events_in_range",
            "description": (
                "Listaa kalenteritapahtumat halutulta ajanjaksolta. Käytä tätä kun käyttäjä pyytää esim. "
                "'tämän viikon tapahtumat' tai 'mitä kalenterissa on huomenna'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {
                        "type": "string",
                        "description": "Ajanjakson alkuaika ISO 8601 -muodossa (Europe/Helsinki).",
                    },
                    "end": {
                        "type": "string",
                        "description": "Ajanjakson loppuaika ISO 8601 -muodossa (exclusive).",
                    },
                    "onlyUpcoming": {
                        "type": "boolean",
                        "description": "Jos true, suodata pois päättyneet tapahtumat vaikka ajanjakso kattaisi menneitä päiviä.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Montako tapahtumaa palautetaan enintään (1-50).",
                        "minimum": 1,
                        "maximum": 50,
                    },
                },
                "required": [],
            },
        },
    },
]


def get_helsinki_now() -> datetime:
    """Return current Helsinki time with fallback if tz data missing."""
    try:
        tz = ZoneInfo("Europe/Helsinki")
    except ZoneInfoNotFoundError:
        # Fallback to fixed UTC+2 offset, best-effort if Windows lacks tzdata
        tz = timezone(timedelta(hours=2))
    return datetime.now(tz)


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        cleaned = value.replace("Z", "+00:00") if value.endswith("Z") else value
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


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


@app.route(route="tasks/{task_id}", methods=["PUT", "DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def task_item(req: func.HttpRequest) -> func.HttpResponse:
    task_id = req.route_params.get("task_id")
    if not task_id:
        return func.HttpResponse(
            body=json.dumps({"error": "task_id is required"}),
            mimetype="application/json",
            status_code=400,
        )

    user_id = DEMO_USER_ID

    if req.method.upper() == "DELETE":
        try:
            db_delete_task(user_id=user_id, task_id=task_id)
            return func.HttpResponse(status_code=204)
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to delete task", "details": str(e)}),
                mimetype="application/json",
                status_code=500,
            )

    if req.method.upper() == "PUT":
        try:
            data = req.get_json()
        except ValueError:
            return func.HttpResponse(
                body=json.dumps({"error": "Invalid JSON"}),
                mimetype="application/json",
                status_code=400,
            )

        updates: dict[str, Any] = {}
        if "title" in data:
            updates["title"] = (data.get("title") or "").strip()
        if "list" in data:
            updates["list"] = data.get("list") or "Inbox"
        if "status" in data:
            updates["status"] = data.get("status") or "open"
        if "dueDate" in data:
            updates["dueDate"] = data.get("dueDate") or None

        try:
            updated = db_update_task(user_id=user_id, task_id=task_id, updates=updates)
            return func.HttpResponse(
                body=json.dumps(updated),
                mimetype="application/json",
                status_code=200,
            )
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to update task", "details": str(e)}),
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

    user_message = (data.get("message") or "").strip()

    if not user_message:
        return func.HttpResponse(
            body=json.dumps({"error": "message is required"}),
            mimetype="application/json",
            status_code=400,
        )

    # TODO: oikea userId authista myöhemmin
    user_id = DEMO_USER_ID

    helsinki_now = get_helsinki_now()
    system_message = {
        "role": "system",
        "content": (
            "Olet ajan- ja tehtävänhallinnan AI-assistentti. "
            "Ymmärrät suomea ja englantia, mutta vastaat oletuksena suomeksi. "
            "Nykyinen päivämäärä ja kellonaika on "
            f"{helsinki_now.isoformat()} Europe/Helsinki -aikavyöhykkeellä. "
            "Kun käyttäjä puhuu ajoista, tulkitse suhteelliset ilmaukset (esim. tänään, huomenna, ensi viikolla) "
            "tämän nykyhetken perusteella ja käytä kuluvan vuoden tulevia päiviä. "
            "Älä koskaan palaa vuoteen 2024 ellei käyttäjä nimenomaan mainitse sitä; "
            "jos käyttäjä sanoo esim. \"huomenna 13-14\", käytä nykyhetkeä seuraavaa päivää klo 13–14. "
            "Kun käyttäjä haluaa lisätä tehtävän, käytä create_task-funktiota. "
            "Kun käyttäjä pyytää poistamaan kaikki tehtävät kaikista listoista tai tietystä listasta, "
            "käytä delete_tasks_in_list-funktiota (ilman list-parametria = kaikki listat). "
            "Kun käyttäjä haluaa lisätä kalenteritapahtuman (palaveri, koodiblokki, tapaaminen), "
            "käytä create_event-funktiota. "
            "Kun käyttäjä pyytää poistamaan kaikki tietyn päivän tai aikavälin tapahtumat (esim. 'poista huomisen tapahtumat'), "
            "laske pyydetty ajanjakso nykyhetken perusteella ja käytä delete_events_in_range-funktiota "
            "start/end-aikoihin, joissa loppuhetki on eksklusiivinen. "
            "Kun käyttäjä haluaa listan tehtävistä (esim. 'näytä kaikki tehtävät' tai 'mitä Work-listalla on'), käytä list_tasks_overview-työkalua. "
            "Kun käyttäjä pyytää kalenteriyhteenvetoa (esim. 'mitä tällä viikolla tapahtuu' tai 'huomisen tapahtumat'), laske aikaväli ja käytä list_events_in_range-työkalua. "
            "Älä kysy turhia lisäkysymyksiä, jos pystyt päättelemään asiat kontekstista, "
            "mutta jos kellonaikaa tai päivää ei voi päätellä varmasti, kysy tarkentava lisäkysymys "
            "ennen create_event-funktion käyttöä. Jos delete_event- tai delete_task-toiminnosta palautuu useita osumia, pyydä käyttäjää täsmentämään mihin id:hen tai päivään viitataan ennen poistamista. "
            "Tehtävälistoina käytä täsmälleen: Inbox, Work tai Personal."
        ),
    }


    messages = [
        system_message,
        {"role": "user", "content": user_message},
    ]

    try:
        # 1. kutsu – malli päättää käytetäänkö työkaluja
        first_completion = azure_openai_client.chat.completions.create(
            model=AZURE_OPENAI_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=400,
            temperature=0.3,
        )

        first_msg = first_completion.choices[0].message

        # Ei työkaluja → suora vastaus
        if not first_msg.tool_calls:
            reply = first_msg.content or ""
            return func.HttpResponse(
                body=json.dumps(
                    {
                        "reply": reply,
                        "model": AZURE_OPENAI_MODEL,
                        "receivedAt": datetime.now(timezone.utc).isoformat(),
                        "toolUsed": None,
                    }
                ),
                mimetype="application/json",
                status_code=200,
            )

        # On tool call(eja) → suoritetaan ne
        tool_calls = first_msg.tool_calls
        tool_results_messages = []
        used_tools: list[str] = []

        for tool_call in tool_calls:
            fn_name = tool_call.function.name
            args_json = tool_call.function.arguments or "{}"
            args = json.loads(args_json)

            if fn_name == "create_task":
                title = (args.get("title") or "").strip()
                list_name = args.get("list") or "Inbox"
                due_date = args.get("dueDate") or None

                task = db_create_task(
                    user_id=user_id,
                    title=title,
                    list_name=list_name,
                    due_date=due_date,
                )

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "create_task",
                        "content": json.dumps(task),
                    }
                )
                used_tools.append("create_task")

            elif fn_name == "create_event":
                title = (args.get("title") or "").strip()
                start_iso = args.get("start")
                end_iso = args.get("end")
                list_name = args.get("list") or "Default"

                # Tässä vaiheessa oletetaan, että malli on jo varmistanut nämä.
                event = db_create_event(
                    user_id=user_id,
                    title=title,
                    start_iso=start_iso,
                    end_iso=end_iso,
                    list_name=list_name,
                )

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "create_event",
                        "content": json.dumps(event),
                    }
                )
                used_tools.append("create_event")

            elif fn_name == "delete_task":
                task_id = (args.get("taskId") or "").strip()
                title = (args.get("title") or "").strip()

                if not task_id and not title:
                    raise ValueError("Either taskId or title is required for delete_task")

                matched_tasks: list[dict[str, Any]] | None = None

                if not task_id and title:
                    matched_tasks = db_find_tasks_by_title(user_id=user_id, title=title)
                    if not matched_tasks:
                        tool_results_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "name": "delete_task",
                                "content": json.dumps(
                                    {
                                        "deleted": False,
                                        "reason": "not_found",
                                        "title": title,
                                    }
                                ),
                            }
                        )
                        continue

                    task_id = str(matched_tasks[0]["id"])

                db_delete_task(user_id=user_id, task_id=task_id)

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "delete_task",
                        "content": json.dumps(
                            {
                                "deleted": True,
                                "deletedTaskId": task_id,
                                "title": title or None,
                                "matches": [
                                    {
                                        "id": str(t.get("id")),
                                        "title": t.get("title"),
                                        "list": t.get("list"),
                                        "dueDate": t.get("dueDate"),
                                    }
                                    for t in (matched_tasks or [])
                                ],
                            }
                        ),
                    }
                )
                used_tools.append("delete_task")

            elif fn_name == "delete_tasks_in_list":
                list_name = args.get("list") or None
                deleted_tasks = db_delete_tasks_for_user(user_id=user_id, list_name=list_name)

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "delete_tasks_in_list",
                        "content": json.dumps(
                            {
                                "deleted": True,
                                "count": len(deleted_tasks),
                                "list": list_name,
                                "tasks": [
                                    {
                                        "id": str(task.get("id")),
                                        "title": task.get("title"),
                                        "list": task.get("list"),
                                        "dueDate": task.get("dueDate"),
                                        "status": task.get("status"),
                                    }
                                    for task in deleted_tasks
                                ],
                            }
                        ),
                    }
                )
                used_tools.append("delete_tasks_in_list")

            elif fn_name == "delete_event":
                event_id = (args.get("eventId") or "").strip()
                title = (args.get("title") or "").strip()

                if not event_id and not title:
                    raise ValueError("Either eventId or title is required for delete_event")

                matched_events: list[dict[str, Any]] | None = None

                if not event_id and title:
                    matched_events = db_find_events_by_title(user_id=user_id, title=title)
                    if not matched_events:
                        tool_results_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "name": "delete_event",
                                "content": json.dumps(
                                    {
                                        "deleted": False,
                                        "reason": "not_found",
                                        "title": title,
                                    }
                                ),
                            }
                        )
                        continue

                    if len(matched_events) == 1:
                        event_id = str(matched_events[0]["id"])
                    else:
                        tool_results_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "name": "delete_event",
                                "content": json.dumps(
                                    {
                                        "deleted": False,
                                        "reason": "multiple_matches",
                                        "title": title,
                                        "matches": [
                                            {
                                                "id": str(e.get("id")),
                                                "title": e.get("title"),
                                                "start": e.get("start"),
                                                "end": e.get("end"),
                                                "list": e.get("list"),
                                            }
                                            for e in matched_events
                                        ],
                                    }
                                ),
                            }
                        )
                        continue

                db_delete_event(user_id=user_id, event_id=event_id)

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "delete_event",
                        "content": json.dumps(
                            {
                                "deleted": True,
                                "deletedEventId": event_id,
                                "title": title or None,
                                "matches": [
                                    {
                                        "id": str(e.get("id")),
                                        "title": e.get("title"),
                                        "start": e.get("start"),
                                        "end": e.get("end"),
                                        "list": e.get("list"),
                                    }
                                    for e in (matched_events or [])
                                ],
                            }
                        ),
                    }
                )
                used_tools.append("delete_event")

            elif fn_name == "delete_events_in_range":
                start_iso = args.get("start")
                end_iso = args.get("end")
                label = (args.get("label") or "").strip() or None

                if not start_iso or not end_iso:
                    raise ValueError("start and end are required for delete_events_in_range")

                deleted_events = db_delete_events_in_range(
                    user_id=user_id,
                    start_iso=start_iso,
                    end_iso=end_iso,
                )

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "delete_events_in_range",
                        "content": json.dumps(
                            {
                                "deleted": True,
                                "count": len(deleted_events),
                                "label": label,
                                "start": start_iso,
                                "end": end_iso,
                                "events": [
                                    {
                                        "id": str(ev.get("id")),
                                        "title": ev.get("title"),
                                        "start": ev.get("start"),
                                        "end": ev.get("end"),
                                        "list": ev.get("list"),
                                    }
                                    for ev in deleted_events
                                ],
                            }
                        ),
                    }
                )
                used_tools.append("delete_events_in_range")

            elif fn_name == "update_task":
                task_id = (args.get("taskId") or "").strip()
                match_title = (args.get("matchTitle") or "").strip()

                if not task_id and match_title:
                    matched = db_find_tasks_by_title(user_id=user_id, title=match_title)
                    if not matched:
                        tool_results_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "name": "update_task",
                                "content": json.dumps(
                                    {
                                        "updated": False,
                                        "reason": "not_found",
                                        "matchTitle": match_title,
                                    }
                                ),
                            }
                        )
                        continue
                    task_id = str(matched[0]["id"])
                elif not task_id and not match_title:
                    raise ValueError("taskId or matchTitle is required for update_task")

                updates: dict[str, Any] = {}
                if "title" in args and args.get("title") is not None:
                    updates["title"] = args.get("title")
                if "list" in args and args.get("list") is not None:
                    updates["list"] = args.get("list")
                if "status" in args and args.get("status") is not None:
                    updates["status"] = args.get("status")
                if "dueDate" in args:
                    due_date_val = args.get("dueDate")
                    updates["dueDate"] = due_date_val if due_date_val else None

                if not updates:
                    continue

                updated_task = db_update_task(
                    user_id=user_id,
                    task_id=task_id,
                    updates=updates,
                )

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "update_task",
                        "content": json.dumps(
                            {
                                "updated": True,
                                "task": updated_task,
                                "matchTitle": match_title or None,
                            }
                        ),
                    }
                )
                used_tools.append("update_task")

            elif fn_name == "update_event":
                event_id = (args.get("eventId") or "").strip()
                match_title = (args.get("matchTitle") or "").strip()

                if not event_id and match_title:
                    matched_events = db_find_events_by_title(user_id=user_id, title=match_title)
                    if not matched_events:
                        tool_results_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "name": "update_event",
                                "content": json.dumps(
                                    {
                                        "updated": False,
                                        "reason": "not_found",
                                        "matchTitle": match_title,
                                    }
                                ),
                            }
                        )
                        continue
                    event_id = str(matched_events[0]["id"])
                elif not event_id and not match_title:
                    raise ValueError("eventId or matchTitle is required for update_event")

                updates: dict[str, Any] = {}
                for field in ["title", "start", "end", "list"]:
                    if field in args and args.get(field) is not None:
                        updates[field] = args.get(field)

                if not updates:
                    continue

                updated_event = db_update_event(
                    user_id=user_id,
                    event_id=event_id,
                    updates=updates,
                )

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "update_event",
                        "content": json.dumps(
                            {
                                "updated": True,
                                "event": updated_event,
                                "matchTitle": match_title or None,
                            }
                        ),
                    }
                )
                used_tools.append("update_event")

            elif fn_name == "list_tasks_overview":
                list_filter = args.get("list") or None
                status_filter = args.get("status") or None
                due_after = parse_iso_datetime(args.get("dueAfter"))
                due_before = parse_iso_datetime(args.get("dueBefore"))
                limit_val = args.get("limit") or 20
                limit_val = max(1, min(50, limit_val))

                all_tasks = db_list_tasks(user_id=user_id)
                filtered: list[dict[str, Any]] = []
                for task in all_tasks:
                    if list_filter and task.get("list") != list_filter:
                        continue
                    if status_filter and task.get("status") != status_filter:
                        continue

                    task_due = parse_iso_datetime(task.get("dueDate"))
                    if due_after and (not task_due or task_due < due_after):
                        continue
                    if due_before and (not task_due or task_due > due_before):
                        continue

                    filtered.append(task)

                total_matches = len(filtered)
                limited_tasks = filtered[:limit_val]

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "list_tasks_overview",
                        "content": json.dumps(
                            {
                                "count": len(limited_tasks),
                                "totalMatches": total_matches,
                                "limit": limit_val,
                                "filters": {
                                    "list": list_filter,
                                    "status": status_filter,
                                    "dueAfter": args.get("dueAfter"),
                                    "dueBefore": args.get("dueBefore"),
                                },
                                "tasks": [
                                    {
                                        "id": str(task.get("id")),
                                        "title": task.get("title"),
                                        "list": task.get("list"),
                                        "status": task.get("status"),
                                        "dueDate": task.get("dueDate"),
                                    }
                                    for task in limited_tasks
                                ],
                            }
                        ),
                    }
                )
                used_tools.append("list_tasks_overview")

            elif fn_name == "list_events_in_range":
                start_iso = args.get("start")
                end_iso = args.get("end")
                only_upcoming = bool(args.get("onlyUpcoming"))
                limit_val = args.get("limit") or 20
                limit_val = max(1, min(50, limit_val))

                start_dt = parse_iso_datetime(start_iso)
                end_dt = parse_iso_datetime(end_iso)
                now_dt = get_helsinki_now() if only_upcoming else None

                events = db_list_events(user_id=user_id)
                filtered_events: list[dict[str, Any]] = []

                for event in events:
                    event_start = parse_iso_datetime(event.get("start"))
                    event_end = parse_iso_datetime(event.get("end")) or event_start

                    if now_dt and event_end and event_end < now_dt:
                        continue

                    if start_dt and event_end and event_end <= start_dt:
                        continue
                    if end_dt and event_start and event_start >= end_dt:
                        continue

                    filtered_events.append(event)

                filtered_events.sort(key=lambda ev: ev.get("start") or "")
                limited_events = filtered_events[:limit_val]

                tool_results_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "list_events_in_range",
                        "content": json.dumps(
                            {
                                "count": len(limited_events),
                                "totalMatches": len(filtered_events),
                                "limit": limit_val,
                                "start": start_iso,
                                "end": end_iso,
                                "onlyUpcoming": only_upcoming,
                                "events": [
                                    {
                                        "id": str(ev.get("id")),
                                        "title": ev.get("title"),
                                        "start": ev.get("start"),
                                        "end": ev.get("end"),
                                        "list": ev.get("list"),
                                    }
                                    for ev in limited_events
                                ],
                            }
                        ),
                    }
                )
                used_tools.append("list_events_in_range")


        # Rakennetaan assistant-viesti tool-calleineen seuraavaa kutsua varten
        assistant_msg_for_second_call = {
            "role": "assistant",
            "content": first_msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in tool_calls
            ],
        }

        second_messages = [
            system_message,
            {"role": "user", "content": user_message},
            assistant_msg_for_second_call,
            *tool_results_messages,
        ]

        # 2. kutsu – malli muotoilee käyttäjälle nätin vastauksen siitä mitä tehtiin
        second_completion = azure_openai_client.chat.completions.create(
            model=AZURE_OPENAI_MODEL,
            messages=second_messages,
            max_tokens=400,
            temperature=0.3,
        )

        final_reply = second_completion.choices[0].message.content or ""

        return func.HttpResponse(
            body=json.dumps(
                {
                    "reply": final_reply,
                    "model": AZURE_OPENAI_MODEL,
                    "receivedAt": datetime.now(timezone.utc).isoformat(),
                    "toolUsed": used_tools,
                }
            ),
            mimetype="application/json",
            status_code=200,
        )

    except Exception as e:
        # yksinkertainen error devivaiheessa
        return func.HttpResponse(
            body=json.dumps({"error": "OpenAI call failed", "details": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="events", methods=["GET", "POST"], auth_level=func.AuthLevel.ANONYMOUS)
def events(req: func.HttpRequest) -> func.HttpResponse:
    method = req.method.upper()
    user_id = DEMO_USER_ID  # myöhemmin authista

    if method == "GET":
        start = req.params.get("start")
        end = req.params.get("end")

        try:
            items = db_list_events(user_id=user_id, start_iso=start, end_iso=end)
            return func.HttpResponse(
                body=json.dumps({"events": items}),
                mimetype="application/json",
                status_code=200,
            )
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to list events", "details": str(e)}),
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
        start_iso = data.get("start")
        end_iso = data.get("end")
        list_name = data.get("list") or "Default"

        if not title or not start_iso or not end_iso:
            return func.HttpResponse(
                body=json.dumps({"error": "title, start and end are required"}),
                mimetype="application/json",
                status_code=400,
            )

        try:
            event = db_create_event(
                user_id=user_id,
                title=title,
                start_iso=start_iso,
                end_iso=end_iso,
                list_name=list_name,
            )
            return func.HttpResponse(
                body=json.dumps(event),
                mimetype="application/json",
                status_code=201,
            )
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to create event", "details": str(e)}),
                mimetype="application/json",
                status_code=500,
            )

    return func.HttpResponse(
        body=json.dumps({"error": "Method not allowed"}),
        mimetype="application/json",
        status_code=405,
    )


@app.route(route="events/{event_id}", methods=["PUT", "DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def event_item(req: func.HttpRequest) -> func.HttpResponse:
    event_id = req.route_params.get("event_id")
    if not event_id:
        return func.HttpResponse(
            body=json.dumps({"error": "event_id is required"}),
            mimetype="application/json",
            status_code=400,
        )

    user_id = DEMO_USER_ID

    if req.method.upper() == "DELETE":
        try:
            db_delete_event(user_id=user_id, event_id=event_id)
            return func.HttpResponse(status_code=204)
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to delete event", "details": str(e)}),
                mimetype="application/json",
                status_code=500,
            )

    if req.method.upper() == "PUT":
        try:
            data = req.get_json()
        except ValueError:
            return func.HttpResponse(
                body=json.dumps({"error": "Invalid JSON"}),
                mimetype="application/json",
                status_code=400,
            )

        updates: dict[str, Any] = {}
        if "title" in data:
            updates["title"] = (data.get("title") or "").strip()
        if "start" in data:
            updates["start"] = data.get("start")
        if "end" in data:
            updates["end"] = data.get("end")
        if "list" in data:
            updates["list"] = data.get("list") or "Default"

        try:
            updated = db_update_event(user_id=user_id, event_id=event_id, updates=updates)
            return func.HttpResponse(
                body=json.dumps(updated),
                mimetype="application/json",
                status_code=200,
            )
        except Exception as e:
            return func.HttpResponse(
                body=json.dumps({"error": "Failed to update event", "details": str(e)}),
                mimetype="application/json",
                status_code=500,
            )

    return func.HttpResponse(
        body=json.dumps({"error": "Method not allowed"}),
        mimetype="application/json",
        status_code=405,
    )
