from mcp.server.fastmcp import FastMCP
import httpx
import json
from typing import Optional, Dict
from starlette.middleware.cors import CORSMiddleware

# Initialize FastMCP Server
mcp = FastMCP("KIRA Quant Platform")

# Point to the api_gateway container inside the docker network
API_BASE_URL = "http://api_gateway:8000/api/v1"

@mcp.tool()
async def get_kira_documentation() -> str:
    """Get the KIRA Python framework rules and API reference for writing strategies.
    
    CALL THIS BEFORE WRITING ANY STRATEGY CODE to understand the exact syntax,
    available indicators, loop conventions, and portfolio state objects.
    """
    return """
# KIRA Strategy Framework API (Token Optimized)

1. CLASS STRUCTURE: All strategies MUST inherit `from quant_sdk.algorithm import QCAlgorithm`.
2. REQUIRED METHODS:
   - `def Initialize(self):` -> Set cash, subscriptions, and indicators.
   - `def OnData(self, data):` -> The tick loop. `data` is a `Slice` object.

3. QCAlgorithm METHODS (use with `self.`):
   - `SetCash(amount: float)`
   - `SetStartDate(year, month, day)` / `SetEndDate(...)`
   - `AddEquity(symbol: str)`
   - `SetHoldings(symbol: str, percentage: float)` -> percentage is 0.0 to 1.0 (-1.0 for short).
   - `Liquidate(symbol: str = None)`
   - `SMA(symbol, period)` / `EMA(symbol, period)` -> Returns an indicator object.
   - `Schedule.On(self.DateRules.EveryDay(), self.TimeRules.At(hour, minute), self.FuncName)`
   - `Debug(msg)` / `Log(msg)`

4. ONDATA / SLICE (`data`):
   - Check if symbol exists: `if data.ContainsKey("NSE_INDEX|Nifty 50"):`
   - Get price: `price = data["NSE_INDEX|Nifty 50"].Price`

5. INDICATORS:
   - Must be initialized in `Initialize()`, e.g., `self.sma = self.SMA("AAPL", 14)`
   - Usage in `OnData`: `if self.sma.IsReady: value = self.sma.Current.Value`

6. PORTFOLIO STATE (`self.Portfolio`):
   - Check holdings: `if self.Portfolio["AAPL"].Invested:`
   - Get total equity: `self.Portfolio.TotalPortfolioValue`
"""

@mcp.tool()
async def list_strategies() -> str:
    """Get a list of all existing trading strategies in the KIRA platform."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_BASE_URL}/strategies")
            response.raise_for_status()
            return json.dumps(response.json(), indent=2)
        except Exception as e:
            return f"Error listing strategies: {str(e)}"

@mcp.tool()
async def get_strategy(project_name: str) -> str:
    """Read the python code and files for a specific trading strategy project.
    
    Args:
        project_name: The name of the strategy project (e.g. 'nifty_intraday_momentum')
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_BASE_URL}/strategies/project/{project_name}")
            response.raise_for_status()
            return json.dumps(response.json(), indent=2)
        except Exception as e:
            return f"Error reading strategy: {str(e)}"

@mcp.tool()
async def save_strategy(project_name: str, code: str) -> str:
    """Write or update Python code for a strategy project.
    
    Args:
        project_name: Name of the strategy to create/update
        code: The raw Python code implementing QCAlgorithm
    """
    async with httpx.AsyncClient() as client:
        payload = {
            "project_name": project_name,
            "files": {"main.py": code}
        }
        try:
            response = await client.post(f"{API_BASE_URL}/strategies/save-project", json=payload)
            response.raise_for_status()
            return f"Successfully saved strategy '{project_name}'."
        except Exception as e:
            return f"Error saving strategy: {str(e)}"

@mcp.tool()
async def run_backtest(
    strategy_code: str, 
    symbol: str, 
    start_date: str, 
    end_date: str, 
    initial_cash: float, 
    strategy_name: str = "CustomStrategy"
) -> str:
    """Trigger a historical backtest for a strategy on the KIRA engine.
    
    Args:
        strategy_code: The raw Python code of the strategy to run (must inherit QCAlgorithm)
        symbol: The instrument identifier, e.g. 'NSE_INDEX|Nifty 50' or 'NSE_EQ|RELIANCE'
        start_date: YYYY-MM-DD
        end_date: YYYY-MM-DD
        initial_cash: Starting capital, e.g. 100000.0
        strategy_name: Optional name for the strategy run
    """
    async with httpx.AsyncClient() as client:
        payload = {
            "strategy_code": strategy_code,
            "symbol": symbol,
            "start_date": start_date,
            "end_date": end_date,
            "initial_cash": initial_cash,
            "strategy_name": strategy_name,
            "speed": "fast"
        }
        try:
            response = await client.post(f"{API_BASE_URL}/backtest/run", json=payload, timeout=15.0)
            response.raise_for_status()
            return json.dumps(response.json(), indent=2)  # Returns the run_id
        except Exception as e:
            return f"Error starting backtest: {str(e)}"

@mcp.tool()
async def get_backtest_status(run_id: str) -> str:
    """Check if a backtest is running, completed, or failed.
    
    Args:
        run_id: The UUID of the backtest
    """
    async with httpx.AsyncClient() as client:
        try:
            # Reusing the logs endpoint which has the status
            response = await client.get(f"{API_BASE_URL}/backtest/logs/{run_id}")
            response.raise_for_status()
            data = response.json()
            return f"Status: {data.get('status', 'Unknown')}"
        except Exception as e:
            return f"Error getting status: {str(e)}"

@mcp.tool()
async def get_backtest_stats(run_id: str) -> str:
    """Get the final statistics (Sharpe, ROI, Drawdown) for a completed backtest.
    
    Args:
        run_id: The UUID of the backtest
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_BASE_URL}/backtest/stats/{run_id}")
            response.raise_for_status()
            return json.dumps(response.json(), indent=2)
        except Exception as e:
            return f"Error getting stats: {str(e)}"

@mcp.tool()
async def run_edge_scan(
    symbols: list[str],
    timeframe: str = "1d",
    start_date: str = "2020-01-01",
    end_date: str = "2030-01-01",
    patterns: Optional[list[str]] = None,
    forward_returns_bars: Optional[list[int]] = None
) -> str:
    """Trigger the KIRA Statistical Edge Scanner to find quantitative edges.
    
    This runs a vectorized scan on the time-series database to find occurrences
    of technical patterns and calculates the expected forward returns (e.g., probability
    of price going up 1 day, 3 days, or 5 days after the pattern occurs).
    
    Args:
        symbols: List of instrument identifiers, e.g. ['NSE_EQ|TATAMOTORS', 'NSE_INDEX|Nifty 50']
        timeframe: Resolution of the data (default: '1d')
        start_date: Start scanning from YYYY-MM-DD
        end_date: Stop scanning at YYYY-MM-DD
        patterns: List of patterns to scan (e.g. ['gap_up_fade', 'inside_bar_breakout', 'oversold_bounce'])
        forward_returns_bars: Bars to calculate forward returns for (e.g. [1, 3, 5])
    """
    if patterns is None:
        patterns = ["gap_up_fade", "consecutive_up_days", "inside_bar_breakout", "oversold_bounce", "volatility_contraction"]
        
    if forward_returns_bars is None:
        forward_returns_bars = [1, 3, 5]
        
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Translate human-readable symbols into ISIN format for QuestDB
        try:
            mapping_resp = await client.get(f"{API_BASE_URL}/backfill/stocks", timeout=10.0)
            if mapping_resp.status_code == 200:
                stock_map = mapping_resp.json()
                name_to_token = {s["name"]: s["token"] for s in stock_map}
                
                translated_symbols = []
                for sym in symbols:
                    clean_sym = sym.split('|')[-1] if '|' in sym else sym
                    if clean_sym in name_to_token:
                        translated_symbols.append(name_to_token[clean_sym])
                    else:
                        translated_symbols.append(sym)
                symbols = translated_symbols
        except Exception:
            pass # Fall back to using the LLM's original symbols if mapping fails
            
        payload = {
            "symbols": symbols,
            "timeframe": timeframe,
            "start_date": start_date,
            "end_date": end_date,
            "patterns": patterns,
            "forward_returns_bars": forward_returns_bars
        }
        try:
            response = await client.post(f"{API_BASE_URL}/edge/scan", json=payload)
            response.raise_for_status()
            return json.dumps(response.json(), indent=2)
        except Exception as e:
            return f"Error running edge scan: {str(e)}"

@mcp.tool()
async def get_backtest_logs(run_id: str) -> str:
    """Get the runtime logs and python tracebacks for a backtest to debug crashes.
    
    Args:
        run_id: The UUID of the backtest
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_BASE_URL}/backtest/logs/{run_id}")
            response.raise_for_status()
            logs = response.json().get('logs', [])
            return "\\n".join(logs)
        except Exception as e:
            return f"Error getting logs: {str(e)}"
# Expose the ASGI app for Uvicorn
if hasattr(mcp, "sse_app"):
    app = mcp.sse_app()
elif hasattr(mcp, "get_starlette_app"):
    app = mcp.get_starlette_app()
else:
    app = None

# Wrap the ASGI app with CORS Middleware to allow web-based MCP clients to connect
if app is not None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
