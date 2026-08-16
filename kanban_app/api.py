import os
from datetime import datetime

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.contrib.auth.models import AbstractBaseUser
from django.http import HttpRequest
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI, Schema
from ninja.security import django_auth

from .history_logger import get_history_file_path, log_task_change
from .models import (
    Board,
    Column,
    Project,
    Tag,
    Task,
    TaskAssignmentHistory,
    TaskStatusHistory,
    TaskUpdate,
)

User = get_user_model()

api = NinjaAPI(
    title="Kanban API",
    description="JSON API for the Kanban SPA",
    auth=django_auth,
)


# --- Schemas ---


class UserSchema(Schema):
    id: int
    username: str


class LoginSchema(Schema):
    username: str
    password: str


class ProjectSchema(Schema):
    id: int
    name: str
    github_url: str


class ProjectCreateSchema(Schema):
    name: str
    github_url: str = ""


class ProjectUpdateSchema(Schema):
    github_url: str


class TagSchema(Schema):
    id: int
    name: str
    color: str


class TagCreateSchema(Schema):
    name: str
    color: str = "#3b82f6"


class ColumnCreateSchema(Schema):
    name: str


class MoveColumnSchema(Schema):
    new_order: int


class TaskCreateSchema(Schema):
    title: str
    description: str = ""
    tags: list[int] = []


class TaskUpdateSchema(Schema):
    title: str
    description: str = ""


class TaskTagsSchema(Schema):
    tags: list[int] = []


class MoveTaskSchema(Schema):
    new_column_id: int
    new_order: int


class TaskAssignSchema(Schema):
    user_id: int | None = None


class TaskUpdateCreateSchema(Schema):
    body: str


class ColumnNameSchema(Schema):
    id: int
    name: str


class HistoryEntrySchema(Schema):
    type: str
    changed_at: datetime
    old_column: ColumnNameSchema | None = None
    new_column: ColumnNameSchema | None = None
    old_assignee: UserSchema | None = None
    new_assignee: UserSchema | None = None
    body: str | None = None
    author: UserSchema | None = None


class TaskSchema(Schema):
    id: int
    project_task_id: int | None
    title: str
    description: str
    order: int
    column_id: int
    tags: list[TagSchema]
    assigned_to: UserSchema | None


class TaskDetailSchema(TaskSchema):
    history: list[HistoryEntrySchema]


class ColumnSchema(Schema):
    id: int
    name: str
    order: int
    tasks: list[TaskSchema]


class BoardSchema(Schema):
    id: int
    name: str
    columns: list[ColumnSchema]


class BoardPayloadSchema(Schema):
    project: ProjectSchema
    board: BoardSchema
    history_content: str | None


class MessageSchema(Schema):
    detail: str


class CsrfSchema(Schema):
    detail: str = "ok"


# --- Helpers ---


def _normalize_github_url(value: str) -> tuple[str, str | None]:
    url = value.strip()
    if not url:
        return "", None
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    try:
        URLValidator()(url)
    except ValidationError:
        return "", "Enter a valid URL."
    return url, None


def _project_schema(project: Project) -> ProjectSchema:
    return ProjectSchema(
        id=project.id,
        name=project.name,
        github_url=project.github_url,
    )


def _user_schema(user: AbstractBaseUser | None) -> UserSchema | None:
    if user is None:
        return None
    return UserSchema(id=user.pk, username=user.get_username())


def _tag_schema(tag: Tag) -> TagSchema:
    return TagSchema(id=tag.id, name=tag.name, color=tag.color)


def _task_schema(task: Task) -> TaskSchema:
    return TaskSchema(
        id=task.id,
        project_task_id=task.project_task_id,
        title=task.title,
        description=task.description,
        order=task.order,
        column_id=task.column_id,
        tags=[_tag_schema(tag) for tag in task.tags.all()],
        assigned_to=_user_schema(task.assigned_to),
    )


def _column_schema(column: Column) -> ColumnSchema:
    return ColumnSchema(
        id=column.id,
        name=column.name,
        order=column.order,
        tasks=[_task_schema(task) for task in column.tasks.all()],
    )


def _board_schema(board: Board) -> BoardSchema:
    columns = board.columns.prefetch_related("tasks__tags", "tasks__assigned_to")
    return BoardSchema(
        id=board.id,
        name=board.name,
        columns=[_column_schema(column) for column in columns],
    )


def _ensure_board(project: Project) -> Board:
    if not hasattr(project, "board"):
        board = Board.objects.create(project=project, name=f"{project.name} Board")
        Column.objects.create(board=board, name="To Do", order=0)
        Column.objects.create(board=board, name="In Progress", order=1)
        Column.objects.create(board=board, name="Done", order=2)
        return board
    return project.board


def _read_history_content(project_id: int) -> str | None:
    file_path = get_history_file_path(project_id)
    if not os.path.exists(file_path):
        return None
    with open(file_path, "r") as f:
        return f.read()


def _task_history(task: Task) -> list[HistoryEntrySchema]:
    history: list[HistoryEntrySchema] = []
    for entry in task.status_history.select_related("old_column", "new_column").all():
        history.append(
            HistoryEntrySchema(
                type="status",
                changed_at=entry.changed_at,
                old_column=(
                    ColumnNameSchema(id=entry.old_column.id, name=entry.old_column.name)
                    if entry.old_column
                    else None
                ),
                new_column=ColumnNameSchema(
                    id=entry.new_column.id, name=entry.new_column.name
                ),
            )
        )
    for entry in task.assignment_history.select_related(
        "old_assignee", "new_assignee"
    ).all():
        history.append(
            HistoryEntrySchema(
                type="assignment",
                changed_at=entry.changed_at,
                old_assignee=_user_schema(entry.old_assignee),
                new_assignee=_user_schema(entry.new_assignee),
            )
        )
    for entry in task.updates.select_related("author").all():
        history.append(
            HistoryEntrySchema(
                type="update",
                changed_at=entry.created_at,
                body=entry.body,
                author=_user_schema(entry.author),
            )
        )
    history.sort(key=lambda item: item.changed_at, reverse=True)
    return history


def _actor_name(request: HttpRequest) -> str:
    if request.user.is_authenticated:
        return request.user.username
    return "System"


# --- Auth (public) ---


@api.get("/auth/csrf", auth=None, response=CsrfSchema)
def get_csrf(request: HttpRequest) -> CsrfSchema:
    get_token(request)
    return CsrfSchema()


@api.post("/auth/login", auth=None, response={200: UserSchema, 400: MessageSchema})
def auth_login(
    request: HttpRequest, data: LoginSchema
) -> tuple[int, UserSchema | MessageSchema]:
    user = authenticate(request, username=data.username, password=data.password)
    if user is None:
        return 400, MessageSchema(detail="Invalid username or password.")
    login(request, user)
    return 200, UserSchema(id=user.id, username=user.username)


@api.post("/auth/logout", auth=None, response=CsrfSchema)
def auth_logout(request: HttpRequest) -> CsrfSchema:
    logout(request)
    return CsrfSchema()


@api.get("/auth/me", response=UserSchema)
def auth_me(request: HttpRequest) -> UserSchema:
    return UserSchema(id=request.user.id, username=request.user.username)


# --- Users ---


@api.get("/users", response=list[UserSchema])
def list_users(request: HttpRequest) -> list[UserSchema]:
    return [
        UserSchema(id=user.id, username=user.username) for user in User.objects.all()
    ]


# --- Projects ---


@api.get("/projects", response=list[ProjectSchema])
def list_projects(request: HttpRequest) -> list[ProjectSchema]:
    return [_project_schema(p) for p in Project.objects.all()]


@api.post("/projects", response={201: ProjectSchema, 400: MessageSchema})
def create_project(
    request: HttpRequest, data: ProjectCreateSchema
) -> tuple[int, ProjectSchema | MessageSchema]:
    github_url, error = _normalize_github_url(data.github_url)
    if error:
        return 400, MessageSchema(detail=error)
    project = Project.objects.create(name=data.name, github_url=github_url)
    return 201, _project_schema(project)


@api.patch(
    "/projects/{project_id}",
    response={200: ProjectSchema, 400: MessageSchema},
)
def update_project(
    request: HttpRequest, project_id: int, data: ProjectUpdateSchema
) -> tuple[int, ProjectSchema | MessageSchema]:
    project = get_object_or_404(Project, id=project_id)
    github_url, error = _normalize_github_url(data.github_url)
    if error:
        return 400, MessageSchema(detail=error)
    project.github_url = github_url
    project.save()
    return 200, _project_schema(project)


@api.delete("/projects/{project_id}", response={204: None})
def delete_project(request: HttpRequest, project_id: int) -> tuple[int, None]:
    project = get_object_or_404(Project, id=project_id)
    project.delete()
    return 204, None


@api.get("/projects/{project_id}/board", response=BoardPayloadSchema)
def get_project_board(request: HttpRequest, project_id: int) -> BoardPayloadSchema:
    project = get_object_or_404(Project, id=project_id)
    board = _ensure_board(project)
    return BoardPayloadSchema(
        project=_project_schema(project),
        board=_board_schema(board),
        history_content=_read_history_content(project_id),
    )


# --- Tags ---


@api.get("/projects/{project_id}/tags", response=list[TagSchema])
def list_project_tags(request: HttpRequest, project_id: int) -> list[TagSchema]:
    project = get_object_or_404(Project, id=project_id)
    return [_tag_schema(tag) for tag in project.tags.all()]


@api.post("/projects/{project_id}/tags", response={201: TagSchema})
def create_tag(
    request: HttpRequest, project_id: int, data: TagCreateSchema
) -> tuple[int, TagSchema]:
    project = get_object_or_404(Project, id=project_id)
    tag = Tag.objects.create(project=project, name=data.name, color=data.color)
    return 201, _tag_schema(tag)


@api.delete("/tags/{tag_id}", response={204: None})
def delete_tag(request: HttpRequest, tag_id: int) -> tuple[int, None]:
    tag = get_object_or_404(Tag, id=tag_id)
    tag.delete()
    return 204, None


# --- Columns ---


@api.post("/boards/{board_id}/columns", response={201: ColumnSchema})
def create_column(
    request: HttpRequest, board_id: int, data: ColumnCreateSchema
) -> tuple[int, ColumnSchema]:
    board = get_object_or_404(Board, id=board_id)
    last_col = board.columns.last()
    order = (last_col.order + 1) if last_col else 0
    column = Column.objects.create(board=board, name=data.name, order=order)
    return 201, _column_schema(column)


@api.patch(
    "/columns/{column_id}",
    response={200: ColumnSchema, 400: MessageSchema},
)
def update_column(
    request: HttpRequest, column_id: int, data: ColumnCreateSchema
) -> tuple[int, ColumnSchema | MessageSchema]:
    name = data.name.strip()
    if not name:
        return 400, MessageSchema(detail="Name is required.")
    column = get_object_or_404(Column, id=column_id)
    column.name = name
    column.save()
    return 200, _column_schema(column)


@api.delete("/columns/{column_id}", response={204: None})
def delete_column(request: HttpRequest, column_id: int) -> tuple[int, None]:
    column = get_object_or_404(Column, id=column_id)
    column.delete()
    return 204, None


@api.post("/columns/{column_id}/move", response={204: None})
def move_column(
    request: HttpRequest, column_id: int, data: MoveColumnSchema
) -> tuple[int, None]:
    column = get_object_or_404(Column, id=column_id)
    board = column.board
    columns = list(board.columns.exclude(id=column.id))
    columns.insert(data.new_order, column)
    for index, col in enumerate(columns):
        col.order = index
        col.save()
    return 204, None


# --- Tasks ---


@api.post("/columns/{column_id}/tasks", response={201: TaskSchema})
def create_task(
    request: HttpRequest, column_id: int, data: TaskCreateSchema
) -> tuple[int, TaskSchema]:
    column = get_object_or_404(Column, id=column_id)

    with transaction.atomic():
        project = Project.objects.select_for_update().get(board=column.board)
        last_task = column.tasks.last()
        order = (last_task.order + 1) if last_task else 0
        task_id = project.next_task_id

        task = Task.objects.create(
            column=column,
            title=data.title,
            description=data.description,
            order=order,
            project_task_id=task_id,
        )
        TaskStatusHistory.objects.create(task=task, new_column=column)
        log_task_change(
            project.id,
            _actor_name(request),
            task.title,
            f"Created in {column.name}",
        )
        if data.tags:
            task.tags.set(data.tags)

        project.next_task_id += 1
        project.save()

    task = Task.objects.prefetch_related("tags", "assigned_to").get(id=task.id)
    return 201, _task_schema(task)


@api.get("/tasks/{task_id}", response=TaskDetailSchema)
def get_task(request: HttpRequest, task_id: int) -> TaskDetailSchema:
    task = get_object_or_404(
        Task.objects.prefetch_related("tags", "assigned_to"), id=task_id
    )
    base = _task_schema(task)
    return TaskDetailSchema(**base.model_dump(), history=_task_history(task))


@api.patch("/tasks/{task_id}", response=TaskSchema)
def update_task(
    request: HttpRequest, task_id: int, data: TaskUpdateSchema
) -> TaskSchema:
    task = get_object_or_404(Task, id=task_id)
    old_title = task.title
    task.title = data.title
    task.description = data.description
    task.save()

    log_task_change(
        task.column.board.project_id,
        _actor_name(request),
        old_title,
        f"Updated details (new title: {task.title})"
        if old_title != task.title
        else "Updated details",
    )
    task = Task.objects.prefetch_related("tags", "assigned_to").get(id=task.id)
    return _task_schema(task)


@api.delete("/tasks/{task_id}", response={204: None})
def delete_task(request: HttpRequest, task_id: int) -> tuple[int, None]:
    task = get_object_or_404(Task, id=task_id)
    project_id = task.column.board.project_id
    task_title = task.title
    task.delete()
    log_task_change(project_id, _actor_name(request), task_title, "Deleted task")
    return 204, None


@api.post("/tasks/{task_id}/tags", response=TaskSchema)
def update_task_tags(
    request: HttpRequest, task_id: int, data: TaskTagsSchema
) -> TaskSchema:
    task = get_object_or_404(Task, id=task_id)
    task.tags.set(data.tags)
    log_task_change(
        task.column.board.project_id,
        _actor_name(request),
        task.title,
        "Tags updated",
    )
    task = Task.objects.prefetch_related("tags", "assigned_to").get(id=task.id)
    return _task_schema(task)


@api.post("/tasks/{task_id}/move", response={204: None, 400: MessageSchema})
def move_task(
    request: HttpRequest, task_id: int, data: MoveTaskSchema
) -> tuple[int, None | MessageSchema]:
    task = get_object_or_404(Task, id=task_id)
    new_col = get_object_or_404(Column, id=data.new_column_id)
    new_order = data.new_order

    if task.column_id == new_col.id:
        tasks = list(new_col.tasks.exclude(id=task.id))
        tasks.insert(new_order, task)
        for idx, item in enumerate(tasks):
            item.order = idx
            item.save()
    else:
        if task.assigned_to_id is None:
            return 400, MessageSchema(detail="Unassigned tasks cannot change status.")

        old_col = task.column
        task.column = new_col
        task.save()

        TaskStatusHistory.objects.create(
            task=task, old_column=old_col, new_column=new_col
        )
        log_task_change(
            old_col.board.project_id,
            _actor_name(request),
            task.title,
            f"Moved from {old_col.name} to {new_col.name}",
        )

        tasks = list(new_col.tasks.exclude(id=task.id))
        tasks.insert(new_order, task)
        for idx, item in enumerate(tasks):
            item.order = idx
            item.save()

    return 204, None


@api.post("/tasks/{task_id}/assign", response=TaskSchema)
def assign_task(
    request: HttpRequest, task_id: int, data: TaskAssignSchema
) -> TaskSchema:
    task = get_object_or_404(Task, id=task_id)
    old_assignee_id = task.assigned_to_id
    new_assignee_id = data.user_id

    if old_assignee_id != new_assignee_id:
        task.assigned_to_id = new_assignee_id
        task.save()
        TaskAssignmentHistory.objects.create(
            task=task,
            old_assignee_id=old_assignee_id,
            new_assignee_id=new_assignee_id,
        )
        assignee_name = task.assigned_to.username if task.assigned_to else "Unassigned"
        log_task_change(
            task.column.board.project_id,
            _actor_name(request),
            task.title,
            f"Assigned to {assignee_name}",
        )

    task = Task.objects.prefetch_related("tags", "assigned_to").get(id=task.id)
    return _task_schema(task)


@api.post(
    "/tasks/{task_id}/updates",
    response={201: TaskDetailSchema, 400: MessageSchema},
)
def create_task_update(
    request: HttpRequest, task_id: int, data: TaskUpdateCreateSchema
) -> tuple[int, TaskDetailSchema | MessageSchema]:
    body = data.body.strip()
    if not body:
        return 400, MessageSchema(detail="Update cannot be empty.")

    task = get_object_or_404(
        Task.objects.prefetch_related("tags", "assigned_to"), id=task_id
    )
    author = request.user if request.user.is_authenticated else None
    TaskUpdate.objects.create(task=task, author=author, body=body)

    preview = body if len(body) <= 80 else f"{body[:77]}..."
    log_task_change(
        task.column.board.project_id,
        _actor_name(request),
        task.title,
        f"Added update: {preview}",
    )

    base = _task_schema(task)
    return 201, TaskDetailSchema(**base.model_dump(), history=_task_history(task))


# --- History ---


@api.delete("/projects/{project_id}/history", response={204: None})
def delete_project_history(request: HttpRequest, project_id: int) -> tuple[int, None]:
    get_object_or_404(Project, id=project_id)
    file_path = get_history_file_path(project_id)
    if os.path.exists(file_path):
        os.remove(file_path)
    return 204, None
