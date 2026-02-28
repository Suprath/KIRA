import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import psycopg2
from psycopg2 import pool
from scanner import EdgeScanner

QUESTDB_HOST = os.getenv("QUESTDB_HOST", "questdb_tsdb")
QUESTDB_PORT = os.getenv("QUESTDB_PORT", "8812")
QUESTDB_USER = os.getenv("QUESTDB_USER", "admin")
QUESTDB_PASSWORD = os.getenv("QUESTDB_PASSWORD", "quest")
QUESTDB_DB = os.getenv("QUESTDB_DB", "qdb")

qdb_pool = None
scanner = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global qdb_pool, scanner
    try:
        qdb_pool = psycopg2.pool.ThreadedConnectionPool(
            1, 20,
            host=QUESTDB_HOST,
            port=QUESTDB_PORT,
            user=QUESTDB_USER,
            password=QUESTDB_PASSWORD,
            database=QUESTDB_DB
        )
        scanner = EdgeScanner(qdb_pool)
        print("✅ Edge Detector initialized")
        yield
    finally:
        if qdb_pool:
            qdb_pool.closeall()

app = FastAPI(title="Quant Edge Detector", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    symbols: List[str]
    timeframe: str = "1d"
    start_date: str = "2020-01-01"
    end_date: str = "2030-01-01"
    patterns: List[str] = [
        "gap_up_fade", 
        "consecutive_up_days", 
        "inside_bar_breakout", 
        "oversold_bounce",
        "volatility_contraction"
    ]
    forward_returns_bars: List[int] = [1, 3, 5]

@app.get("/")
def health_check():
    return {"status": "online", "service": "edge_detector"}

@app.post("/scan")
def run_edge_scan(request: ScanRequest):
    try:
        if not scanner:
            raise HTTPException(status_code=503, detail="Database pool not uninitialized")
            
        results = scanner.run_scan(
            symbols=request.symbols,
            timeframe=request.timeframe,
            start_date=request.start_date,
            end_date=request.end_date,
            patterns=request.patterns,
            forward_returns_bars=request.forward_returns_bars
        )
        return {"status": "success", "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
