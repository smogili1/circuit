# Makefile for Circuit

# Define directories for logs
LOG_DIR := .logs
SERVER_LOG := $(LOG_DIR)/server.log

# Port (unified server)
PORT := 3001

# Ensure log directory exists
$(shell mkdir -p $(LOG_DIR))

.PHONY: dev-start dev-stop dev-restart logs install clean test test-backend test-frontend build help

# Start unified server in the background
dev-start:
	@echo "Ensuring log directory $(LOG_DIR) exists..."
	@mkdir -p $(LOG_DIR)
	@echo "Starting unified server (port $(PORT)) in background (Log: $(SERVER_LOG))..."
	@cd backend && npm run dev > $(CURDIR)/$(SERVER_LOG) 2>&1 & echo $$! > $(CURDIR)/$(LOG_DIR)/server.pid
	@echo "Development server started."
	@echo "  App: http://localhost:$(PORT)"

# Stop server using port number
dev-stop:
	@echo "Stopping development server..."
	@echo "Attempting to stop process on port $(PORT)..."
	@-lsof -ti :$(PORT) | xargs kill -9 2>/dev/null || echo "No process found on port $(PORT) or already stopped."
	@sleep 1
	@echo "Development server stopped."

# Restart server
dev-restart: dev-stop dev-start

# Tail dev logs
logs:
	@echo "Tailing dev logs (Ctrl+C to stop)..."
	@echo "==========================================="
	@if ls $(LOG_DIR)/*.log >/dev/null 2>&1; then \
		tail -n 100 -F $(LOG_DIR)/*.log; \
	else \
		echo "No log files found in $(LOG_DIR). Start dev server with: make dev-start"; \
	fi

# Install all dependencies
install:
	@echo "Installing dependencies..."
	@npm install

# Clean log files
clean:
	@echo "Cleaning log files..."
	@rm -rf $(LOG_DIR)

# Run all tests
test: test-backend test-frontend
	@echo "All tests completed!"

test-backend:
	@echo "Running backend tests..."
	@cd backend && npm test

test-frontend:
	@echo "Running frontend tests..."
	@cd frontend && npm test

# Build all
build:
	@echo "Building all packages..."
	@npm run build

# Help
help:
	@echo "Circuit Development Commands"
	@echo "========================================="
	@echo ""
	@echo "Development:"
	@echo "  make dev-start    - Start unified server in background"
	@echo "  make dev-stop     - Stop development server"
	@echo "  make dev-restart  - Restart development server"
	@echo "  make logs         - Tail development logs"
	@echo ""
	@echo "Installation:"
	@echo "  make install      - Install all dependencies"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run all tests"
	@echo "  make test-backend - Run backend tests"
	@echo "  make test-frontend - Run frontend tests"
	@echo ""
	@echo "Build:"
	@echo "  make build        - Build all packages"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        - Remove log files"
