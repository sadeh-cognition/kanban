from typing import Any
from django.db import models
from django.db.models.query import QuerySet
from django.contrib.auth import get_user_model

User = get_user_model()


class ActiveProjectManager(models.Manager):
    def get_queryset(self) -> QuerySet:
        return super().get_queryset().filter(is_deleted=False)


class Project(models.Model):
    name = models.CharField(max_length=255)
    github_url = models.URLField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    next_task_id = models.IntegerField(default=1)

    objects = ActiveProjectManager()
    all_objects = models.Manager()

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        self.is_deleted = True
        self.save()
        return (1, {self._meta.label: 1})

    def __str__(self) -> str:
        return self.name


class Tag(models.Model):
    project = models.ForeignKey(Project, related_name="tags", on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=20, default="#3b82f6")

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class Board(models.Model):
    project = models.OneToOneField(
        Project, related_name="board", on_delete=models.CASCADE, null=True, blank=True
    )
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Column(models.Model):
    board = models.ForeignKey(Board, related_name="columns", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.board.name} - {self.name}"


class Task(models.Model):
    column = models.ForeignKey(Column, related_name="tasks", on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    tags = models.ManyToManyField(Tag, related_name="tasks", blank=True)
    assigned_to = models.ForeignKey(
        User,
        related_name="assigned_tasks",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    order = models.IntegerField(default=0)
    project_task_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title


class TaskStatusHistory(models.Model):
    task = models.ForeignKey(
        Task, related_name="status_history", on_delete=models.CASCADE
    )
    old_column = models.ForeignKey(
        Column, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    new_column = models.ForeignKey(Column, related_name="+", on_delete=models.CASCADE)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.task.title} moved to {self.new_column.name} at {self.changed_at}"


class TaskAssignmentHistory(models.Model):
    task = models.ForeignKey(
        Task, related_name="assignment_history", on_delete=models.CASCADE
    )
    old_assignee = models.ForeignKey(
        User, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    new_assignee = models.ForeignKey(
        User, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.task.title} assigned from {self.old_assignee} to {self.new_assignee} at {self.changed_at}"


class TaskUpdate(models.Model):
    task = models.ForeignKey(Task, related_name="updates", on_delete=models.CASCADE)
    author = models.ForeignKey(
        User, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Update on {self.task.title} at {self.created_at}"
