from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kanban_app", "0008_taskassignmenthistory"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="github_url",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
    ]
