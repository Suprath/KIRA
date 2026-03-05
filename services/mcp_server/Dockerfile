FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir httpx
RUN pip install --no-cache-dir mcp[cli,sse]>=1.1.2 uvicorn starlette

# Copy server code
COPY server.py .

# Expose SSE port
EXPOSE 8080

# Run Uvicorn to serve the FastMCP app
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
