import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from kanban_app.models import Board, Column, Project, Tag, Task

User = get_user_model()


class AuthenticatedApiTestCase(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="apiuser", password="secret")
        self.client = Client()
        self.client.force_login(self.user)

    def post_json(self, path: str, data: dict) -> object:
        return self.client.post(
            path,
            data=json.dumps(data),
            content_type="application/json",
        )


class TaskMoveTest(AuthenticatedApiTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.project = Project.objects.create(name="Test Project")
        self.board = Board.objects.create(project=self.project, name="Test Board")
        self.col1 = Column.objects.create(board=self.board, name="To Do", order=0)
        self.col2 = Column.objects.create(board=self.board, name="In Progress", order=1)
        self.task1 = Task.objects.create(
            column=self.col1, title="Task 1", order=0, assigned_to=self.user
        )

    def test_move_task_different_column(self) -> None:
        response = self.post_json(
            f"/api/tasks/{self.task1.id}/move",
            {"new_column_id": self.col2.id, "new_order": 0},
        )
        self.assertEqual(response.status_code, 204)
        self.task1.refresh_from_db()
        self.assertEqual(self.task1.column_id, self.col2.id)

    def test_move_unassigned_task_different_column_fails(self) -> None:
        task_unassigned = Task.objects.create(
            column=self.col1, title="Unassigned", order=1
        )
        response = self.post_json(
            f"/api/tasks/{task_unassigned.id}/move",
            {"new_column_id": self.col2.id, "new_order": 1},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Unassigned tasks cannot change status.",
        )

    def test_project_task_id_assignment(self) -> None:
        response = self.post_json(
            f"/api/columns/{self.col1.id}/tasks",
            {"title": "Task 1", "description": "test"},
        )
        self.assertEqual(response.status_code, 201)

        response = self.post_json(
            f"/api/columns/{self.col1.id}/tasks",
            {"title": "Task 2", "description": "test"},
        )
        self.assertEqual(response.status_code, 201)

        p2 = Project.objects.create(name="Project 2")
        b2 = Board.objects.create(project=p2, name="Board 2")
        c2 = Column.objects.create(board=b2, name="To Do", order=0)

        response = self.post_json(
            f"/api/columns/{c2.id}/tasks",
            {"title": "Task 1 for P2", "description": "test"},
        )
        self.assertEqual(response.status_code, 201)

        tasks_p1 = Task.objects.filter(column__board__project=self.project).order_by(
            "id"
        )
        self.assertEqual(tasks_p1.count(), 3)

        new_task_1 = tasks_p1[1]
        new_task_2 = tasks_p1[2]
        self.assertEqual(new_task_1.project_task_id, 1)
        self.assertEqual(new_task_2.project_task_id, 2)

        task_p2 = Task.objects.get(column__board__project=p2)
        self.assertEqual(task_p2.project_task_id, 1)


class TagTest(AuthenticatedApiTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.project = Project.objects.create(name="Tag Project")
        self.board = Board.objects.create(project=self.project, name="Tag Board")
        self.col = Column.objects.create(board=self.board, name="To Do", order=0)

    def test_tag_creation_and_assignment(self) -> None:
        tag1 = Tag.objects.create(project=self.project, name="Bug", color="#ff0000")
        tag2 = Tag.objects.create(project=self.project, name="Feature", color="#00ff00")

        task = Task.objects.create(
            column=self.col, title="Fix login", order=0, project_task_id=1
        )
        task.tags.set([tag1, tag2])

        task.refresh_from_db()
        self.assertEqual(task.tags.count(), 2)
        self.assertIn(tag1, task.tags.all())
        self.assertIn(tag2, task.tags.all())

    def test_api_create_tag(self) -> None:
        response = self.post_json(
            f"/api/projects/{self.project.id}/tags",
            {"name": "Urgent", "color": "#ff0000"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Tag.objects.filter(project=self.project).count(), 1)
        tag = Tag.objects.get(project=self.project)
        self.assertEqual(tag.name, "Urgent")

    def test_api_create_task_with_tags(self) -> None:
        tag = Tag.objects.create(project=self.project, name="Backend")
        response = self.post_json(
            f"/api/columns/{self.col.id}/tasks",
            {"title": "API rework", "description": "", "tags": [tag.id]},
        )
        self.assertEqual(response.status_code, 201)
        task = Task.objects.get(title="API rework")
        self.assertEqual(task.tags.count(), 1)
        self.assertEqual(task.tags.first(), tag)


class TaskStatusHistoryTest(AuthenticatedApiTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.project = Project.objects.create(name="Status Project")
        self.board = Board.objects.create(project=self.project, name="Status Board")
        self.col1 = Column.objects.create(board=self.board, name="To Do", order=0)
        self.col2 = Column.objects.create(board=self.board, name="In Progress", order=1)

    def test_status_history_on_task_creation(self) -> None:
        response = self.post_json(
            f"/api/columns/{self.col1.id}/tasks",
            {"title": "New Task", "description": "Testing status"},
        )
        self.assertEqual(response.status_code, 201)

        task = Task.objects.get(title="New Task")
        history = task.status_history.all()
        self.assertEqual(history.count(), 1)
        self.assertEqual(history[0].old_column, None)
        self.assertEqual(history[0].new_column, self.col1)

    def test_status_history_on_task_move(self) -> None:
        task = Task.objects.create(
            column=self.col1, title="Moving Task", order=0, assigned_to=self.user
        )

        response = self.post_json(
            f"/api/tasks/{task.id}/move",
            {"new_column_id": self.col2.id, "new_order": 0},
        )
        self.assertEqual(response.status_code, 204)

        history = task.status_history.all()
        self.assertEqual(history.count(), 1)
        self.assertEqual(history[0].old_column, self.col1)
        self.assertEqual(history[0].new_column, self.col2)

    def test_no_status_history_on_same_column_move(self) -> None:
        task = Task.objects.create(column=self.col1, title="Reordering Task", order=0)

        response = self.post_json(
            f"/api/tasks/{task.id}/move",
            {"new_column_id": self.col1.id, "new_order": 1},
        )
        self.assertEqual(response.status_code, 204)

        history = task.status_history.all()
        self.assertEqual(history.count(), 0)


class TaskAssignmentTest(AuthenticatedApiTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.project = Project.objects.create(name="Assign Project")
        self.board = Board.objects.create(project=self.project, name="Assign Board")
        self.col = Column.objects.create(board=self.board, name="To Do")
        self.task = Task.objects.create(column=self.col, title="Assign Task")
        self.assignee = User.objects.create_user(username="assignuser", password="x")

    def test_api_assign_task(self) -> None:
        response = self.post_json(
            f"/api/tasks/{self.task.id}/assign",
            {"user_id": self.assignee.id},
        )
        self.assertEqual(response.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.assigned_to, self.assignee)

    def test_api_unassign_task(self) -> None:
        self.task.assigned_to = self.assignee
        self.task.save()

        response = self.post_json(
            f"/api/tasks/{self.task.id}/assign",
            {"user_id": None},
        )
        self.assertEqual(response.status_code, 200)
        self.task.refresh_from_db()
        self.assertIsNone(self.task.assigned_to)
