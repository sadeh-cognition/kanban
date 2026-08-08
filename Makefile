.PHONY: run backend frontend build-frontend test

backend:
	uv run python manage.py runserver 8005

frontend:
	npm --prefix frontend run dev

build-frontend:
	npm --prefix frontend run build

run: build-frontend backend

test:
	uv run pytest
