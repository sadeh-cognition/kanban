from django.contrib import admin
from .models import (
    Board,
    Column,
    Task,
    Project,
    Tag,
    TaskStatusHistory,
    TaskAssignmentHistory,
    TaskUpdate,
)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_at", "updated_at")
    search_fields = ("name",)


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "name", "created_at", "updated_at")
    search_fields = ("name",)
    list_filter = ("project",)


@admin.register(Column)
class ColumnAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "board", "order", "created_at", "updated_at")
    list_filter = ("board",)
    search_fields = ("name",)


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "assigned_to",
        "column",
        "order",
        "get_tags",
        "created_at",
        "updated_at",
    )
    list_filter = ("column__board__project", "column__board", "column")
    search_fields = ("title", "description")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("tags")

    @admin.display(description="Tags")
    def get_tags(self, obj):
        return ", ".join([tag.name for tag in obj.tags.all()])


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "color", "project")
    list_filter = ("project",)
    search_fields = ("name",)


@admin.register(TaskStatusHistory)
class TaskStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "task", "old_column", "new_column", "changed_at")
    list_filter = ("new_column", "old_column")
    search_fields = ("task__title",)


@admin.register(TaskAssignmentHistory)
class TaskAssignmentHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "task", "old_assignee", "new_assignee", "changed_at")
    list_filter = ("changed_at",)
    search_fields = ("task__title", "old_assignee__username", "new_assignee__username")


@admin.register(TaskUpdate)
class TaskUpdateAdmin(admin.ModelAdmin):
    list_display = ("id", "task", "author", "created_at")
    list_filter = ("created_at",)
    search_fields = ("task__title", "body", "author__username")
