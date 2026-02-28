"use client";

import React, { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Play, Loader2, TrendingUp, Percent, BarChart3, AlertTriangle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from 'next/link';
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Search, X } from 'lucide-react';

interface ScanResult {
    pattern: string;
    occurrences: number;
    win_rate: number;
    expected_return: number;
    history: {
        timestamp: string;
        symbol: string;
        close: number;
        return_pct: number;
    }[];
}

export default function EdgeDashboard() {
    const [selectedSymbols, setSelectedSymbols] = useState<{ key: string, symbol: string }[]>([
        { key: "NSE_EQ|INE002A01018", symbol: "RELIANCE" },
        { key: "NSE_EQ|INE009A01021", symbol: "INFY" },
        { key: "NSE_EQ|INE040A01034", symbol: "HDFCBANK" }
    ]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<{ key: string, symbol: string, name: string, exchange: string }[]>([]);
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
        if (searchQuery.length >= 3) {
            const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8080`;
            fetch(`${apiUrl}/api/v1/instruments/search?query=${searchQuery}`)
                .then(r => r.json())
                .then(setSearchResults)
                .catch(() => setSearchResults([]));
        } else {
            setSearchResults([]);
        }
    }, [searchQuery]);

    const [startDate, setStartDate] = useState("2023-01-01");
    const [endDate, setEndDate] = useState("2024-01-01");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<ScanResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [logs, setLogs] = useState<{ time: string, msg: string, type: 'info' | 'success' | 'error' | 'warn' }[]>([]);

    const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
    };

    const runScan = async () => {
        setLoading(true);
        setError(null);
        setResults(null);
        setLogs([]);

        let interval: NodeJS.Timeout | null = null;

        // Compute symbols and host bindings per run explicitly
        const symList = selectedSymbols.map(s => s.key);
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8080`;

        try {
            addLog("Initializing Vectorized Edge Engine...", 'info');

            // Simulate processing stages for UX
            let step = 0;
            const steps = [
                "Allocating memory for Pandas DataFrame matrices.",
                "Establishing secure connection to QuestDB Timeseries block.",
                `Ingesting OHLCV boundary constraints: ${startDate} to ${endDate}`,
                "Executing vectorized array shift operations...",
                "Filtering T+1, T+3, T+5 forward returns distributions.",
                "Calculating Sharpe Ratio and expected values for signals.",
                "Compiling statistical output grid."
            ];
            interval = setInterval(() => {
                if (step < steps.length) {
                    addLog(steps[step], 'warn');
                    step++;
                }
            }, 800);

            const res = await fetch(`${apiUrl}/api/v1/edge/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbols: symList,
                    timeframe: "1d",
                    start_date: startDate,
                    end_date: endDate,
                    patterns: ["gap_up_fade", "consecutive_up_days", "inside_bar_breakout", "oversold_bounce", "volatility_contraction"],
                    forward_returns_bars: [1, 3, 5]
                })
            });

            if (interval) clearInterval(interval);

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to execute scan");
            }
            const data = await res.json();
            addLog("Edge Scan Matrix successfully compiled. Displaying telemetry.", 'success');
            setResults(data.data);
        } catch (err: unknown) {
            if (interval) clearInterval(interval);
            const msg = err instanceof Error ? err.message : "An unknown error occurred";

            if (msg.includes("MISSING_DATA")) {
                addLog("QuestDB Timeseries empty for requested symbols. Initiating Data Backfiller Protocol...", 'warn');
                try {
                    setLoading(true);
                    addLog(`Requesting automated block backfill from NSE Historical for ${symList.length} symbols...`, 'info');

                    const backfillRes = await fetch(`${apiUrl}/api/v1/backfill/start`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            start_date: startDate,
                            end_date: endDate,
                            stocks: selectedSymbols.map(s => s.symbol),
                            interval: "1",
                            unit: "day"
                        })
                    });

                    if (!backfillRes.ok) throw new Error("Backfiller engine rejected payload.");

                    addLog("Data Backfiller job deployed successfully. Polling engine status...", 'warn');

                    // Active polling instead of hardcoded wait
                    let backfillComplete = false;
                    while (!backfillComplete) {
                        try {
                            const statusRes = await fetch(`${apiUrl}/api/v1/backfill/status`);
                            if (statusRes.ok) {
                                const statusData = await statusRes.json();
                                if (statusData.finished) {
                                    backfillComplete = true;
                                    break;
                                } else {
                                    addLog(`[Backfill Engine] Processing ${statusData.current_stock || 'batch'}... (${statusData.completed_stocks}/${statusData.total_stocks})`, 'info');
                                }
                            }
                        } catch (e) {
                            console.warn("Status poll failed", e);
                        }
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                    addLog("Backfill window complete. Re-acquiring QuestDB connection...", 'success');

                    // Recursive re-attempt
                    return runScan();

                } catch (backfillErr) {
                    const bMsg = backfillErr instanceof Error ? backfillErr.message : "Backfill failure";
                    addLog(`Backfiller Error: ${bMsg}`, 'error');
                    setError(bMsg);
                    setLoading(false);
                }
            } else {
                addLog(`Execution Halted: ${msg}`, 'error');
                setError(msg);
                setLoading(false);
            }
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-300">
            {/* Header */}
            <header className="flex-none flex items-center justify-between border-b px-6 py-4 bg-card/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-4 shrink-0">
                    <Link href="/">
                        <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2 border-l border-border pl-4">
                        <Zap className="h-5 w-5 text-purple-500 fill-current shrink-0" />
                        <h1 className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent truncate">Vectorized Edge Scanner</h1>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <ThemeToggle />
                </div>
            </header>

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Config Sidebar */}
                <aside className="w-full md:w-80 border-r border-border bg-card/50 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 md:min-h-screen">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Universe Selection</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Symbols</label>

                                <div className="flex flex-wrap gap-2 mb-2">
                                    {selectedSymbols.map((sym, idx) => (
                                        <Badge key={idx} variant="secondary" className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20 px-2 pl-3">
                                            {sym.symbol}
                                            <button
                                                onClick={() => setSelectedSymbols(prev => prev.filter((_, i) => i !== idx))}
                                                className="hover:bg-purple-500/20 rounded-full p-0.5 ml-1 transition-colors"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>

                                <div className="relative">
                                    <div className="flex items-center gap-2 bg-background px-3 py-1.5 border border-border rounded-md focus-within:border-purple-500/50 transition-colors">
                                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <input
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                setSearchOpen(true);
                                            }}
                                            onFocus={() => setSearchOpen(true)}
                                            placeholder="Add symbol..."
                                            className="bg-transparent border-none outline-none text-sm font-mono text-foreground w-full placeholder:text-muted-foreground/50"
                                        />
                                    </div>

                                    {searchOpen && searchResults.length > 0 && (
                                        <div className="absolute top-full left-0 mt-2 w-full bg-card border border-border rounded-md shadow-xl z-50 max-h-[300px] overflow-y-auto custom-scrollbar">
                                            {searchResults.map((s, idx) => (
                                                <div
                                                    key={idx}
                                                    className="p-2 px-3 hover:bg-purple-500/10 hover:text-purple-400 cursor-pointer border-b border-border/50 last:border-0 flex justify-between items-center transition-colors"
                                                    onClick={() => {
                                                        if (!selectedSymbols.find(x => x.key === s.key)) {
                                                            setSelectedSymbols(prev => [...prev, { key: s.key, symbol: s.symbol }]);
                                                        }
                                                        setSearchQuery("");
                                                        setSearchOpen(false);
                                                    }}
                                                >
                                                    <div>
                                                        <div className="font-mono font-bold text-sm text-foreground">{s.symbol}</div>
                                                        <div className="text-xs text-muted-foreground truncate max-w-[150px]">{s.name}</div>
                                                    </div>
                                                    <Badge variant="outline" className={s.exchange === "NSE_EQ" ? "border-blue-500/30 text-blue-500" : "border-green-500/30 text-green-500"}>
                                                        {s.exchange}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {searchOpen && searchQuery.length >= 3 && searchResults.length === 0 && (
                                        <div className="absolute top-full left-0 mt-2 w-full bg-card border border-border rounded-md shadow-xl z-50 p-4 text-sm text-muted-foreground text-center">
                                            No symbols found.
                                        </div>
                                    )}
                                    {searchOpen && (
                                        <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(false)} />
                                    )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-2">Vectorized multi-asset universe search.</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Temporal Range</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date</label>
                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="font-mono text-xs bg-background" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date</label>
                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="font-mono text-xs bg-background" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Detection Engine</h2>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="border-border/50">Gap Up Fade</Badge>
                            <Badge variant="secondary" className="border-border/50">3-Day Run</Badge>
                            <Badge variant="secondary" className="border-border/50">Inside Bar</Badge>
                            <Badge variant="secondary" className="border-border/50">Oversold Bounce</Badge>
                            <Badge variant="secondary" className="border-border/50">VCP Breakout</Badge>
                        </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-border">
                        <Button
                            onClick={runScan}
                            disabled={loading}
                            className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg shadow-purple-500/20 transition-all uppercase tracking-widest text-xs"
                        >
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" /> Computing Matrix</> : <><Play className="mr-2 h-4 w-4 fill-current shrink-0" /> Execute Scan</>}
                        </Button>
                    </div>
                </aside>

                {/* Results Area */}
                <div className="flex-1 bg-background p-6 md:p-8 overflow-y-auto">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg flex items-center gap-3 mb-6">
                            <AlertTriangle className="h-5 w-5 shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    {!results && !loading && !error && (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-2xl p-12">
                            <Zap className="h-12 w-12 text-muted-foreground/30 mb-4 shrink-0" />
                            <h3 className="text-xl font-bold text-foreground">Awaiting Scan Execution</h3>
                            <p className="text-center max-w-sm mt-2 text-sm">The edge detection engine uses vectorized Pandas arrays to process years of tick data in milliseconds. Configure your universe and execute to find alpha.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="h-full flex flex-col pt-4 max-w-4xl mx-auto w-full">
                            <div className="mb-8 flex items-center justify-center text-purple-500 gap-4">
                                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                                    <Zap className="h-8 w-8 fill-current opacity-50 shrink-0" />
                                </motion.div>
                                <p className="font-mono text-xl tracking-widest uppercase animate-pulse font-bold">Vectorizing Market Streams</p>
                            </div>

                            {/* Terminal Window */}
                            <div className="flex-1 w-full bg-black border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-sm min-h-[400px]">
                                <div className="flex bg-slate-900 border-b border-slate-800 px-4 py-2 items-center justify-between shadow-sm backdrop-blur-md">
                                    <div className="flex gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                    </div>
                                    <div className="text-slate-500 text-xs font-semibold tracking-wider">EDGE_DETECTOR_NODE</div>
                                    <div className="w-10"></div>
                                </div>
                                <div className="p-4 overflow-y-auto space-y-2 text-slate-300 custom-scrollbar flex-1 flex flex-col max-h-[500px]">
                                    {logs.map((log, i) => (
                                        <div key={i} className="flex gap-4">
                                            <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                                            <span className={`break-words ${log.type === 'error' ? 'text-red-400 font-bold' : log.type === 'success' ? 'text-green-400 font-bold' : log.type === 'warn' ? 'text-yellow-400' : 'text-blue-400'}`}>
                                                {log.msg}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="mt-auto pt-4 flex items-center gap-2 text-amber-500">
                                        <span className="animate-pulse">_</span>
                                        <span className="text-xs">Awaiting Execution Lock Release...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {results && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold tracking-tight">Statistical Edge Ranking (T+1)</h2>
                                <Badge variant="outline" className="text-xs font-mono shrink-0">{selectedSymbols.length} Symbols Parsed</Badge>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {results.map((res, idx) => {
                                    const isProfitable = res.expected_return > 0;
                                    const highWinRate = res.win_rate > 55;
                                    const hasData = res.occurrences > 0;

                                    return (
                                        <div key={idx} className={`relative bg-card border rounded-2xl p-6 overflow-hidden transition-shadow hover:shadow-md ${highWinRate && hasData ? 'border-green-500/30 ring-1 ring-green-500/10' : ''} ${!hasData ? 'opacity-60' : ''}`}>
                                            {highWinRate && hasData && <div className="absolute top-0 right-0 p-2"><Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 shadow-sm shrink-0">Alpha Detected</Badge></div>}

                                            <h3 className="text-xl font-bold capitalize mb-6 pr-24">{res.pattern.replace(/_/g, ' ')}</h3>

                                            <div className="grid grid-cols-2 gap-4 mb-6">
                                                <div className="bg-background rounded-xl p-4 border border-border">
                                                    <div className="flex justify-between items-center mb-1 gap-1">
                                                        <span className="text-xs font-semibold text-muted-foreground uppercase truncate">Win Rate</span>
                                                        <Percent className="h-3 w-3 text-muted-foreground opacity-50 shrink-0" />
                                                    </div>
                                                    <div className={`text-2xl font-bold font-mono ${highWinRate && hasData ? 'text-green-500' : 'text-foreground'}`}>
                                                        {hasData ? `${res.win_rate.toFixed(1)}%` : '---'}
                                                    </div>
                                                </div>
                                                <div className="bg-background rounded-xl p-4 border border-border">
                                                    <div className="flex justify-between items-center mb-1 gap-1">
                                                        <span className="text-xs font-semibold text-muted-foreground uppercase truncate">Expected (T+1)</span>
                                                        <TrendingUp className="h-3 w-3 text-muted-foreground opacity-50 shrink-0" />
                                                    </div>
                                                    <div className={`text-2xl font-bold font-mono ${isProfitable && hasData ? 'text-green-500' : hasData ? 'text-red-500' : 'text-foreground'}`}>
                                                        {hasData ? `${isProfitable ? '+' : ''}${res.expected_return.toFixed(2)}%` : '---'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground flex items-center gap-1">
                                                    <BarChart3 className="h-4 w-4 shrink-0" /> {res.occurrences} Signals Fired
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Signal History Table view */}
                            {results.length > 0 && results.some(r => r.history.length > 0) && (
                                <div className="mt-8 border border-border rounded-xl bg-card overflow-hidden">
                                    <div className="bg-muted/30 px-6 py-4 border-b border-border flex justify-between items-center">
                                        <h3 className="font-bold">Recent Trade Inferences</h3>
                                        <Badge variant="secondary" className="font-mono text-xs shrink-0">Top Signals</Badge>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left min-w-[500px]">
                                            <thead className="text-xs uppercase bg-background text-muted-foreground">
                                                <tr>
                                                    <th className="px-6 py-3 font-medium">Date</th>
                                                    <th className="px-6 py-3 font-medium">Symbol</th>
                                                    <th className="px-6 py-3 font-medium text-right">Close Price</th>
                                                    <th className="px-6 py-3 font-medium text-right">T+1 Return</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {results.find(r => r.history.length > 0)?.history.slice(0, 10).map((h, i) => (
                                                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                                                        <td className="px-6 py-3 font-mono text-muted-foreground">{h.timestamp}</td>
                                                        <td className="px-6 py-3 font-medium">{h.symbol.split('|').pop()}</td>
                                                        <td className="px-6 py-3 text-right font-mono">₹{h.close.toFixed(2)}</td>
                                                        <td className={`px-6 py-3 text-right font-mono font-medium ${h.return_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {h.return_pct >= 0 ? '+' : ''}{h.return_pct.toFixed(2)}%
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </motion.div>
                    )}
                </div>
            </main>
        </div>
    );
}
