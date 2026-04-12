.PHONY: setup dev db db-push db-generate db-studio check typecheck lint fix test test-ui clean

# Zero-conf setup: clone → make setup → make dev
setup:
	cp -n .env.example .env 2>/dev/null || true
	cp -n packages/db/.env.example packages/db/.env 2>/dev/null || true
	pnpm install
	docker compose up -d
	@echo "Waiting for Postgres..."
	@until docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done
	pnpm -w run db:push
	prek install
	@echo "✓ Ready. Run 'make dev' to start."

# Start both web and server
dev:
	pnpm -w run dev

# Database
db:
	docker compose up -d
db-push:
	pnpm -w run db:push
db-generate:
	pnpm -w run db:generate
db-studio:
	pnpm -w run db:studio

# Quality gates
check: lint typecheck
lint:
	@agent-harness lint
fix:
	@agent-harness fix
typecheck:
	pnpm -w run typecheck

# BDD Tests (uses separate test database on port 5433)
test:
	cd e2e && npx bddgen && npx playwright test
test-ui:
	cd e2e && npx bddgen && npx playwright test --ui

# Cleanup
clean:
	docker compose down -v
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/web/.output apps/web/dist apps/server/dist
