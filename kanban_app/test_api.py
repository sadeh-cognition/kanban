import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from model_bakery import baker

from kanban_app.models import Board, Column, Project, Tag, Task, TaskAssignmentHistory

User = get_user_model()


@pytest.fixture
def api_client() -> Client:
    return Client()


@pytest.fixture
def user(db: None) -> User:
    return User.objects.create_user(username="tester", password="secret")


@pytest.fixture
def auth_client(api_client: Client, user: User) -> Client:
    api_client.force_login(user)
    return api_client


def _json(response) -> dict | list:
    return response.json()


@pytest.mark.django_db
def test_auth_required(api_client: Client) -> None:
    response = api_client.get("/api/projects")
    assert response.status_code == 401


@pytest.mark.django_db
def test_login_and_me(api_client: Client, user: User) -> None:
    bad = api_client.post(
        "/api/auth/login",
        data=json.dumps({"username": "tester", "password": "wrong"}),
        content_type="application/json",
    )
    assert bad.status_code == 400
    assert _json(bad)["detail"] == "Invalid username or password."

    ok = api_client.post(
        "/api/auth/login",
        data=json.dumps({"username": "tester", "password": "secret"}),
        content_type="application/json",
    )
    assert ok.status_code == 200
    assert _json(ok) == {"id": user.id, "username": "tester"}

    me = api_client.get("/api/auth/me")
    assert me.status_code == 200
    assert _json(me)["username"] == "tester"


@pytest.mark.django_db
def test_csrf_endpoint(api_client: Client) -> None:
    response = api_client.get("/api/auth/csrf")
    assert response.status_code == 200
    assert "csrftoken" in response.cookies


@pytest.mark.django_db
def test_list_and_create_project(auth_client: Client) -> None:
    baker.make(Project, name="P1")
    response = auth_client.get("/api/projects")
    assert response.status_code == 200
    names = {p["name"] for p in _json(response)}
    assert "P1" in names

    created = auth_client.post(
        "/api/projects",
        data=json.dumps({"name": "New Project"}),
        content_type="application/json",
    )
    assert created.status_code == 201
    assert _json(created)["name"] == "New Project"
    assert Project.objects.filter(name="New Project").exists()


@pytest.mark.django_db
def test_delete_project(auth_client: Client) -> None:
    project = baker.make(Project)
    response = auth_client.delete(f"/api/projects/{project.id}")
    assert response.status_code == 204
    project.refresh_from_db()
    assert project.is_deleted is True


@pytest.mark.django_db
def test_project_board_bootstrap(
    auth_client: Client, tmp_path, settings, monkeypatch
) -> None:
    from kanban_app import history_logger

    settings.BASE_DIR = tmp_path
    monkeypatch.setattr(history_logger, "HISTORY_DIR", str(tmp_path / "task_history"))

    project = baker.make(Project, name="Board Project")
    response = auth_client.get(f"/api/projects/{project.id}/board")
    assert response.status_code == 200
    payload = _json(response)
    assert payload["project"]["name"] == "Board Project"
    assert payload["board"]["name"] == "Board Project Board"
    assert [c["name"] for c in payload["board"]["columns"]] == [
        "To Do",
        "In Progress",
        "Done",
    ]
    assert payload["history_content"] is None


@pytest.mark.django_db
def test_tags_crud(auth_client: Client) -> None:
    project = baker.make(Project)
    created = auth_client.post(
        f"/api/projects/{project.id}/tags",
        data=json.dumps({"name": "Bug", "color": "#ff0000"}),
        content_type="application/json",
    )
    assert created.status_code == 201
    tag = _json(created)
    assert tag["name"] == "Bug"

    listed = auth_client.get(f"/api/projects/{project.id}/tags")
    assert listed.status_code == 200
    assert any(t["name"] == "Bug" for t in _json(listed))

    deleted = auth_client.delete(f"/api/tags/{tag['id']}")
    assert deleted.status_code == 204
    assert not Tag.objects.filter(id=tag["id"]).exists()


@pytest.mark.django_db
def test_create_and_delete_column(auth_client: Client) -> None:
    board = baker.make(Board)
    created = auth_client.post(
        f"/api/boards/{board.id}/columns",
        data=json.dumps({"name": "In Progress"}),
        content_type="application/json",
    )
    assert created.status_code == 201
    column = _json(created)
    assert column["name"] == "In Progress"
    assert Column.objects.filter(id=column["id"]).exists()

    deleted = auth_client.delete(f"/api/columns/{column['id']}")
    assert deleted.status_code == 204
    assert not Column.objects.filter(id=column["id"]).exists()


@pytest.mark.django_db
def test_rename_column(auth_client: Client) -> None:
    column = baker.make(Column, name="To Do")
    response = auth_client.patch(
        f"/api/columns/{column.id}",
        data=json.dumps({"name": "  Backlog  "}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert _json(response)["name"] == "Backlog"
    column.refresh_from_db()
    assert column.name == "Backlog"

    empty = auth_client.patch(
        f"/api/columns/{column.id}",
        data=json.dumps({"name": "   "}),
        content_type="application/json",
    )
    assert empty.status_code == 400
    assert _json(empty)["detail"] == "Name is required."


@pytest.mark.django_db
def test_move_column(auth_client: Client) -> None:
    board = baker.make(Board)
    col1 = baker.make(Column, board=board, order=0)
    col2 = baker.make(Column, board=board, order=1)
    col3 = baker.make(Column, board=board, order=2)
    response = auth_client.post(
        f"/api/columns/{col3.id}/move",
        data=json.dumps({"new_order": 0}),
        content_type="application/json",
    )
    assert response.status_code == 204
    col1.refresh_from_db()
    col2.refresh_from_db()
    col3.refresh_from_db()
    assert col3.order == 0
    assert col1.order == 1
    assert col2.order == 2


@pytest.mark.django_db
def test_create_update_delete_task(auth_client: Client) -> None:
    project = baker.make(Project, next_task_id=1)
    board = baker.make(Board, project=project)
    col = baker.make(Column, board=board, order=0)
    tag = baker.make(Tag, project=project)

    created = auth_client.post(
        f"/api/columns/{col.id}/tasks",
        data=json.dumps({"title": "Task A", "description": "Desc", "tags": [tag.id]}),
        content_type="application/json",
    )
    assert created.status_code == 201
    task = _json(created)
    assert task["title"] == "Task A"
    assert task["project_task_id"] == 1
    assert task["tags"][0]["id"] == tag.id

    updated = auth_client.patch(
        f"/api/tasks/{task['id']}",
        data=json.dumps({"title": "Task B", "description": "New"}),
        content_type="application/json",
    )
    assert updated.status_code == 200
    assert _json(updated)["title"] == "Task B"

    details = auth_client.get(f"/api/tasks/{task['id']}")
    assert details.status_code == 200
    body = _json(details)
    assert body["title"] == "Task B"
    assert isinstance(body["history"], list)

    deleted = auth_client.delete(f"/api/tasks/{task['id']}")
    assert deleted.status_code == 204
    assert not Task.objects.filter(id=task["id"]).exists()


@pytest.mark.django_db
def test_update_task_tags(auth_client: Client) -> None:
    project = baker.make(Project)
    board = baker.make(Board, project=project)
    col = baker.make(Column, board=board, order=0)
    task = baker.make(Task, column=col, order=0)
    tag1 = baker.make(Tag, project=project)
    tag2 = baker.make(Tag, project=project)

    response = auth_client.post(
        f"/api/tasks/{task.id}/tags",
        data=json.dumps({"tags": [tag1.id, tag2.id]}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert len(_json(response)["tags"]) == 2
    assert task.tags.count() == 2


@pytest.mark.django_db
def test_task_assignment(auth_client: Client) -> None:
    project = baker.make(Project)
    board = baker.make(Board, project=project)
    col = baker.make(Column, board=board, order=0)
    task = baker.make(Task, column=col, order=0)
    user1 = baker.make(User)
    user2 = baker.make(User)

    response = auth_client.post(
        f"/api/tasks/{task.id}/assign",
        data=json.dumps({"user_id": user1.id}),
        content_type="application/json",
    )
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.assigned_to == user1
    assert TaskAssignmentHistory.objects.filter(
        task=task, old_assignee=None, new_assignee=user1
    ).exists()

    response = auth_client.post(
        f"/api/tasks/{task.id}/assign",
        data=json.dumps({"user_id": user2.id}),
        content_type="application/json",
    )
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.assigned_to == user2

    response = auth_client.post(
        f"/api/tasks/{task.id}/assign",
        data=json.dumps({"user_id": None}),
        content_type="application/json",
    )
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.assigned_to is None
    assert TaskAssignmentHistory.objects.filter(
        task=task, old_assignee=user2, new_assignee=None
    ).exists()


@pytest.mark.django_db
def test_move_task_rejects_unassigned_status_change(auth_client: Client) -> None:
    project = baker.make(Project)
    board = baker.make(Board, project=project)
    col1 = baker.make(Column, board=board, order=0)
    col2 = baker.make(Column, board=board, order=1)
    task = baker.make(Task, column=col1, order=0, assigned_to=None)

    response = auth_client.post(
        f"/api/tasks/{task.id}/move",
        data=json.dumps({"new_column_id": col2.id, "new_order": 0}),
        content_type="application/json",
    )
    assert response.status_code == 400
    assert _json(response)["detail"] == "Unassigned tasks cannot change status."


@pytest.mark.django_db
def test_move_assigned_task(auth_client: Client, user: User) -> None:
    project = baker.make(Project)
    board = baker.make(Board, project=project)
    col1 = baker.make(Column, board=board, order=0)
    col2 = baker.make(Column, board=board, order=1)
    task = baker.make(Task, column=col1, order=0, assigned_to=user)

    response = auth_client.post(
        f"/api/tasks/{task.id}/move",
        data=json.dumps({"new_column_id": col2.id, "new_order": 0}),
        content_type="application/json",
    )
    assert response.status_code == 204
    task.refresh_from_db()
    assert task.column_id == col2.id


@pytest.mark.django_db
def test_list_users(auth_client: Client, user: User) -> None:
    other = baker.make(User, username="other")
    response = auth_client.get("/api/users")
    assert response.status_code == 200
    usernames = {u["username"] for u in _json(response)}
    assert user.username in usernames
    assert other.username in usernames


@pytest.mark.django_db
def test_delete_project_history(auth_client: Client, tmp_path, settings) -> None:
    from kanban_app import history_logger

    settings.BASE_DIR = tmp_path
    history_logger.HISTORY_DIR = str(tmp_path / "task_history")
    project = baker.make(Project)
    history_logger.log_task_change(project.id, "tester", "Task", "Created")
    path = history_logger.get_history_file_path(project.id)
    assert path.exists() if hasattr(path, "exists") else True

    response = auth_client.delete(f"/api/projects/{project.id}/history")
    assert response.status_code == 204
    import os

    assert not os.path.exists(history_logger.get_history_file_path(project.id))
