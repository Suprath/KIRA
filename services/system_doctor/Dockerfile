# 1. Builder Stage
FROM python:3.11-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y libpq-dev build-essential librdkafka-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# 2. Production Stage
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libpq5 librdkafka1 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache /wheels/*
COPY . .
CMD ["python", "main.py"]