"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Play, Loader2, AlertTriangle, Shield, Target, Brain, Clock, Layers, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from 'next/link';
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Search, X } from 'lucide-react';

/* ───── Types ───── */
interface DeepScanResult {
    summary: FingerPrint[];
    regimes: RegimeData[];
    temporal: TemporalData[];
    patterns: PatternData[];
    key_levels: LevelData[];
    volatility: VolData[];
    meta: { total_rows: number; symbols: string[]; date_range: string; timeframe: string };
}
interface FingerPrint { symbol: string; personality: string; current_regime: string; strategy_recommendation: string; best_day: string; worst_day: string; gap_behavior: string; position_sizing: string; stop_loss: string; key_levels: string; total_return: number; sharpe_ratio: number; max_drawdown: number; historical_volatility: number; top_patterns: string[]; actionable_insights: string[]; }
interface RegimeData { symbol: string; current_regime: string; distribution: Record<string, number>; transitions: Record<string, Record<string, number>>; regime_performance: Record<string, { days: number; avg_return: number; total_return: number; win_rate: number; avg_atr_pct: number }>; total_days: number; }
interface TemporalData { symbol: string; day_of_week: Record<string, { avg_return: number; median_return: number; win_rate: number; sample_size: number; std_dev: number; best_day: number; worst_day: number }>; best_day: string; worst_day: string; hourly: Record<string, { avg_return: number; volume_share: number }>; gap_analysis: { avg_gap_pct: number; gap_up_count: number; gap_down_count: number; gap_up_fill_rate: number; gap_down_fill_rate: number; avg_gap_up_size: number; avg_gap_down_size: number }; week_of_month: Record<string, { avg_return: number; win_rate: number; sample_size: number }>; }
interface PatternResult { pattern: string; occurrences: number; win_rate: number; avg_return: number; expectancy: number; avg_win: number; avg_loss: number; risk_reward: number; consistency: string; history: { date: string; close: number; return_pct: number }[]; }
interface PatternData { symbol: string; patterns: PatternResult[]; total_patterns_detected: number; }
interface LevelData { symbol: string; levels: { price: number; type: string; touches: number; strength: string; distance_pct: number }[]; current_price: number; nearest_support: { price: number; distance_pct: number; strength: string } | null; nearest_resistance: { price: number; distance_pct: number; strength: string } | null; }
interface VolData { symbol: string; current_atr: number; current_atr_pct: number; historical_volatility: number; avg_daily_range_pct: number; max_drawdown: number; max_drawdown_date: string; max_consecutive_down_days: number; volatility_trend: string; total_return: number; sharpe_ratio: number; trading_days: number; }

const TABS = ['Summary', 'Regimes', 'Temporal', 'Patterns', 'Key Levels', 'Risk'];
const TAB_ICONS = [Brain, Layers, Clock, Zap, Target, Shield];
const REGIME_COLORS: Record<string, string> = { 'Uptrend': 'bg-green-500', 'Downtrend': 'bg-red-500', 'Range-Bound': 'bg-yellow-500', 'High Volatility': 'bg-purple-500', 'Low Volatility': 'bg-blue-500' };

export default function EdgeDashboard() {
    const [selectedSymbols, setSelectedSymbols] = useState<{ key: string, symbol: string }[]>([
        { key: "NSE_EQ|INE002A01018", symbol: "RELIANCE" },
        { key: "NSE_EQ|INE009A01021", symbol: "INFY" },
        { key: "NSE_EQ|INE040A01034", symbol: "HDFCBANK" }
    ]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<{ key: string, symbol: string, name: string, exchange: string }[]>([]);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [startDate, setStartDate] = useState("2025-01-01");
    const [endDate, setEndDate] = useState("2025-03-01");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DeepScanResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState(0);
    const [activeSym, setActiveSym] = useState(0);
    const [logs, setLogs] = useState<{ time: string, msg: string, type: 'info' | 'success' | 'error' | 'warn' }[]>([]);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const fetchInstruments = useCallback((q: string) => {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8080`;
        // empty query → use '%' which matches everything via ILIKE
        const param = q.trim() === '' ? '%25' : encodeURIComponent(q);
        setSearchLoading(true);
        fetch(`${apiUrl}/api/v1/instruments/search?query=${param}`)
            .then(r => r.json())
            .then(d => { setSearchResults(Array.isArray(d) ? d : []); setSearchLoading(false); })
            .catch(() => { setSearchResults([]); setSearchLoading(false); });
    }, []);

    useEffect(() => {
        if (!searchOpen) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchInstruments(searchQuery), 200);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [searchQuery, searchOpen, fetchInstruments]);

    const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
    };

    const runScan = async () => {
        setLoading(true); setError(null); setData(null); setLogs([]);
        const symList = selectedSymbols.map(s => s.key);
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8080`;
        let interval: NodeJS.Timeout | null = null;

        try {
            addLog("Initializing Deep Analysis Engine...", 'info');
            let step = 0;
            const steps = [
                "Connecting to QuestDB Timeseries engine.",
                `Loading OHLCV data: ${startDate} to ${endDate}`,
                "Module 1: Classifying market regimes (Uptrend/Downtrend/Range)...",
                "Module 2: Extracting temporal patterns (day-of-week, hourly, gaps)...",
                "Module 3: Running 17 technical pattern detectors with forward returns...",
                "Module 4: Auto-detecting support/resistance levels...",
                "Module 5: Computing volatility & risk profile (ATR, drawdown)...",
                "Module 6: Generating behavioral fingerprint & trading recommendations...",
                "Compiling actionable insights..."
            ];
            interval = setInterval(() => { if (step < steps.length) { addLog(steps[step], 'warn'); step++; } }, 1200);

            const res = await fetch(`${apiUrl}/api/v1/edge/deep-scan`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: symList, timeframe: "1m", start_date: startDate, end_date: endDate })
            });
            if (interval) clearInterval(interval);

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to execute deep scan");
            }
            const result = await res.json();
            addLog(`Deep scan complete. ${result.data.meta.total_rows.toLocaleString()} data points analyzed.`, 'success');
            setData(result.data);
            setLoading(false);
        } catch (err: unknown) {
            if (interval) clearInterval(interval);
            const msg = err instanceof Error ? err.message : "Unknown error";
            if (msg.includes("MISSING_DATA")) {
                addLog("No data found. Initiating backfill...", 'warn');
                try {
                    await fetch(`${apiUrl}/api/v1/backfill/start`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ start_date: startDate, end_date: endDate, stocks: selectedSymbols.map(s => s.symbol), interval: "1", unit: "minutes" })
                    });
                    addLog("Backfill started. Polling...", 'info');
                    let done = false;
                    while (!done) {
                        try { const sr = await fetch(`${apiUrl}/api/v1/backfill/status`); if (sr.ok) { const sd = await sr.json(); if (sd.finished) { done = true; break; } addLog(`Backfilling ${sd.current_stock || '...'}  (${sd.completed_stocks}/${sd.total_stocks})`, 'info'); } } catch { }
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    addLog("Backfill complete. Re-running scan...", 'success');
                    return runScan();
                } catch (be) { const bm = be instanceof Error ? be.message : "Backfill error"; addLog(bm, 'error'); setError(bm); setLoading(false); }
            } else { addLog(`Error: ${msg}`, 'error'); setError(msg); setLoading(false); }
        }
    };

    const sym = data?.summary?.[activeSym];
    const reg = data?.regimes?.[activeSym];
    const temp = data?.temporal?.[activeSym];
    const pat = data?.patterns?.[activeSym];
    const lvl = data?.key_levels?.[activeSym];
    const vol = data?.volatility?.[activeSym];

    /* ────── RENDER ────── */
    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-300">
            {/* Header */}
            <header className="flex-none flex items-center justify-between border-b px-6 py-4 bg-card/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-4 shrink-0">
                    <Link href="/"><Button variant="ghost" size="icon" className="hover:bg-primary/10"><ArrowLeft className="h-4 w-4" /></Button></Link>
                    <div className="flex items-center gap-2 border-l border-border pl-4">
                        <Brain className="h-5 w-5 text-purple-500 fill-current shrink-0" />
                        <h1 className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent truncate">Deep Edge Scanner</h1>
                    </div>
                </div>
                <ThemeToggle />
            </header>

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* ── Sidebar ── */}
                <aside className="w-full md:w-80 border-r border-border bg-card/50 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 md:min-h-screen">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Universe Selection</h2>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {selectedSymbols.map((s, i) => (
                                <Badge key={i} variant="secondary" className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20 px-2 pl-3">
                                    {s.symbol}
                                    <button onClick={() => setSelectedSymbols(p => p.filter((_, j) => j !== i))} className="hover:bg-purple-500/20 rounded-full p-0.5 ml-1"><X className="h-3 w-3" /></button>
                                </Badge>
                            ))}
                        </div>
                        <div className="relative">
                            <div className="flex items-center gap-2 bg-background px-3 py-1.5 border border-border rounded-md focus-within:border-purple-500/50">
                                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                                <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder="Add symbol..." className="bg-transparent border-none outline-none text-sm font-mono text-foreground w-full placeholder:text-muted-foreground/50" />
                            </div>
                            {searchOpen && (
                                <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-lg shadow-2xl z-50 max-h-[280px] overflow-y-auto">
                                    {searchLoading ? (
                                        <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Loading stocks...</span>
                                        </div>
                                    ) : searchResults.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">No instruments found</div>
                                    ) : (
                                        searchResults.map((s, i) => {
                                            const alreadyAdded = !!selectedSymbols.find(x => x.key === s.key);
                                            return (
                                                <div key={i}
                                                    className={`p-2.5 px-3 flex justify-between items-center border-b border-border/50 last:border-0 transition-colors ${alreadyAdded
                                                            ? 'opacity-50 cursor-not-allowed bg-muted/20'
                                                            : 'hover:bg-purple-500/10 cursor-pointer'
                                                        }`}
                                                    onClick={() => {
                                                        if (alreadyAdded) return;
                                                        setSelectedSymbols(p => [...p, { key: s.key, symbol: s.symbol }]);
                                                        setSearchQuery('');
                                                        setSearchOpen(false);
                                                    }}
                                                >
                                                    <div>
                                                        <div className="font-mono font-bold text-sm text-foreground">{s.symbol}</div>
                                                        <div className="text-xs text-muted-foreground">{s.exchange}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {alreadyAdded && <span className="text-xs text-green-500 font-medium">✓ Added</span>}
                                                        <Badge variant="outline" className={s.exchange === 'NSE_EQ' ? 'border-blue-500/30 text-blue-400 text-[10px]' : 'border-green-500/30 text-green-400 text-[10px]'}>{s.exchange}</Badge>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                            {searchOpen && <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(false)} />}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Analysis Period</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Start</label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="font-mono text-xs bg-background" /></div>
                            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">End</label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="font-mono text-xs bg-background" /></div>
                        </div>
                    </div>
                    {data && data.summary.length > 1 && (
                        <div>
                            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Stock Selector</h2>
                            <div className="space-y-2">{data.summary.map((s, i) => (
                                <button key={i} onClick={() => setActiveSym(i)} className={`w-full text-left p-3 rounded-lg border transition-all ${i === activeSym ? 'border-purple-500 bg-purple-500/10' : 'border-border hover:border-purple-500/30'}`}>
                                    <div className="font-mono font-bold text-sm">{s.symbol.split('|').pop()}</div>
                                    <div className="text-xs text-muted-foreground">{s.current_regime}</div>
                                </button>
                            ))}</div>
                        </div>
                    )}
                    <div className="mt-auto pt-4 border-t border-border">
                        <Button onClick={runScan} disabled={loading} className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg shadow-purple-500/20 uppercase tracking-widest text-xs">
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing</> : <><Play className="mr-2 h-4 w-4 fill-current" /> Deep Scan</>}
                        </Button>
                    </div>
                </aside>

                {/* ── Main Content ── */}
                <div className="flex-1 bg-background overflow-y-auto">
                    {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 m-6 rounded-lg flex items-center gap-3"><AlertTriangle className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">{error}</p></div>}

                    {!data && !loading && !error && (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-2xl p-12 m-6">
                            <Brain className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <h3 className="text-xl font-bold text-foreground">Deep Edge Scanner</h3>
                            <p className="text-center max-w-md mt-2 text-sm">Extracts regime classification, temporal patterns, 17+ technical patterns, support/resistance levels, volatility profiles, and generates actionable trading insights from historical data.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="h-full flex flex-col pt-4 max-w-4xl mx-auto w-full p-6">
                            <div className="mb-8 flex items-center justify-center text-purple-500 gap-4">
                                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Brain className="h-8 w-8 fill-current opacity-50" /></motion.div>
                                <p className="font-mono text-xl tracking-widest uppercase animate-pulse font-bold">Analyzing Stock DNA</p>
                            </div>
                            <div className="flex-1 w-full bg-black border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-sm min-h-[400px]">
                                <div className="flex bg-slate-900 border-b border-slate-800 px-4 py-2 items-center justify-between"><div className="flex gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-yellow-500" /><div className="w-3 h-3 rounded-full bg-green-500" /></div><div className="text-slate-500 text-xs font-semibold tracking-wider">DEEP_SCAN_ENGINE</div><div className="w-10" /></div>
                                <div className="p-4 overflow-y-auto space-y-2 text-slate-300 flex-1 flex flex-col max-h-[500px]">
                                    {logs.map((l, i) => (<div key={i} className="flex gap-4"><span className="text-slate-600 shrink-0">[{l.time}]</span><span className={l.type === 'error' ? 'text-red-400 font-bold' : l.type === 'success' ? 'text-green-400 font-bold' : l.type === 'warn' ? 'text-yellow-400' : 'text-blue-400'}>{l.msg}</span></div>))}
                                    <div className="mt-auto pt-4 flex items-center gap-2 text-amber-500"><span className="animate-pulse">_</span><span className="text-xs">Processing...</span></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {data && sym && (
                        <div className="p-6 md:p-8">
                            {/* Tabs */}
                            <div className="flex gap-1 mb-6 overflow-x-auto border-b border-border pb-0">
                                {TABS.map((t, i) => {
                                    const Icon = TAB_ICONS[i]; return (
                                        <button key={i} onClick={() => setTab(i)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${i === tab ? 'border-purple-500 text-purple-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                                            <Icon className="h-4 w-4" />{t}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Tab 0: Executive Summary */}
                            {tab === 0 && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    {/* Personality Card */}
                                    <div className="bg-gradient-to-br from-purple-900/30 via-card to-blue-900/20 border border-purple-500/30 rounded-2xl p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div><Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 mb-2">Stock Personality</Badge><h2 className="text-2xl font-bold">{sym.symbol.split('|').pop()}</h2></div>
                                            <Badge className={`${sym.current_regime === 'Uptrend' ? 'bg-green-500/20 text-green-400' : sym.current_regime === 'Downtrend' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{sym.current_regime}</Badge>
                                        </div>
                                        <p className="text-lg font-medium text-purple-300 mb-4">{sym.personality}</p>
                                        <p className="text-sm text-muted-foreground">{sym.strategy_recommendation}</p>
                                    </div>

                                    {/* Key Metrics Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[{ label: 'Total Return', value: `${sym.total_return >= 0 ? '+' : ''}${sym.total_return}%`, color: sym.total_return >= 0 ? 'text-green-500' : 'text-red-500' },
                                        { label: 'Sharpe Ratio', value: sym.sharpe_ratio.toFixed(2), color: sym.sharpe_ratio > 1 ? 'text-green-500' : 'text-yellow-500' },
                                        { label: 'Max Drawdown', value: `${sym.max_drawdown}%`, color: 'text-red-400' },
                                        { label: 'Hist. Volatility', value: `${sym.historical_volatility}%`, color: 'text-blue-400' }
                                        ].map((m, i) => (
                                            <div key={i} className="bg-card border border-border rounded-xl p-4">
                                                <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">{m.label}</div>
                                                <div className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Quick Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-card border border-border rounded-xl p-4"><div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Best / Worst Day</div><div className="text-sm"><span className="text-green-400 font-medium">{sym.best_day}</span> / <span className="text-red-400 font-medium">{sym.worst_day}</span></div></div>
                                        <div className="bg-card border border-border rounded-xl p-4"><div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Position Sizing</div><div className="text-sm text-foreground">{sym.position_sizing}</div></div>
                                        <div className="bg-card border border-border rounded-xl p-4"><div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Stop Loss</div><div className="text-sm text-foreground">{sym.stop_loss}</div></div>
                                    </div>

                                    {/* Key Levels & Gap */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-card border border-border rounded-xl p-4"><div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Key Levels</div><div className="text-sm font-mono text-foreground">{sym.key_levels || 'N/A'}</div></div>
                                        <div className="bg-card border border-border rounded-xl p-4"><div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Gap Behavior</div><div className="text-sm text-foreground">{sym.gap_behavior}</div></div>
                                    </div>

                                    {/* Actionable Insights */}
                                    <div className="bg-card border border-border rounded-2xl p-6">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-500" /> Actionable Insights</h3>
                                        <div className="space-y-3">
                                            {sym.actionable_insights.map((ins, i) => (
                                                <div key={i} className="flex items-start gap-3 p-3 bg-background rounded-lg border border-border"><ChevronRight className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" /><p className="text-sm">{ins}</p></div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Tab 1: Regime Analysis */}
                            {tab === 1 && reg && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        {Object.entries(reg.distribution).sort((a, b) => b[1] - a[1]).map(([name, pct]) => (
                                            <div key={name} className="bg-card border border-border rounded-xl p-4 text-center">
                                                <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${REGIME_COLORS[name] || 'bg-gray-500'}`} />
                                                <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">{name}</div>
                                                <div className="text-2xl font-bold font-mono">{pct}%</div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="bg-card border border-border rounded-2xl p-6">
                                        <h3 className="text-lg font-bold mb-4">Regime-Specific Performance</h3>
                                        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground bg-background"><tr><th className="px-4 py-3 text-left">Regime</th><th className="px-4 py-3 text-right">Days</th><th className="px-4 py-3 text-right">Avg Return</th><th className="px-4 py-3 text-right">Total Return</th><th className="px-4 py-3 text-right">Win Rate</th><th className="px-4 py-3 text-right">Avg ATR%</th></tr></thead>
                                            <tbody className="divide-y divide-border">{Object.entries(reg.regime_performance).map(([name, d]) => (
                                                <tr key={name} className="hover:bg-muted/30"><td className="px-4 py-3 font-medium flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${REGIME_COLORS[name] || 'bg-gray-500'}`} />{name}</td><td className="px-4 py-3 text-right font-mono">{d.days}</td><td className={`px-4 py-3 text-right font-mono ${d.avg_return >= 0 ? 'text-green-500' : 'text-red-500'}`}>{d.avg_return >= 0 ? '+' : ''}{d.avg_return}%</td><td className={`px-4 py-3 text-right font-mono ${d.total_return >= 0 ? 'text-green-500' : 'text-red-500'}`}>{d.total_return >= 0 ? '+' : ''}{d.total_return}%</td><td className="px-4 py-3 text-right font-mono">{d.win_rate}%</td><td className="px-4 py-3 text-right font-mono">{d.avg_atr_pct}%</td></tr>
                                            ))}</tbody></table></div>
                                    </div>

                                    {/* Regime Transitions */}
                                    <div className="bg-card border border-border rounded-2xl p-6">
                                        <h3 className="text-lg font-bold mb-4">Regime Transition Matrix</h3>
                                        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground bg-background"><tr><th className="px-4 py-3 text-left">From ↓ / To →</th>{Object.keys(reg.transitions).map(k => <th key={k} className="px-4 py-3 text-center text-xs">{k}</th>)}</tr></thead>
                                            <tbody className="divide-y divide-border">{Object.entries(reg.transitions).map(([from, tos]) => (
                                                <tr key={from}><td className="px-4 py-3 font-medium">{from}</td>{Object.keys(reg.transitions).map(to => <td key={to} className="px-4 py-3 text-center font-mono">{tos[to] ? `${tos[to]}%` : '-'}</td>)}</tr>
                                            ))}</tbody></table></div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Tab 2: Temporal Patterns */}
                            {tab === 2 && temp && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    <div className="bg-card border border-border rounded-2xl p-6">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Clock className="h-5 w-5 text-blue-500" /> Day-of-Week Performance</h3>
                                        <div className="grid grid-cols-5 gap-3">{Object.entries(temp.day_of_week).map(([day, d]) => (
                                            <div key={day} className={`rounded-xl p-4 text-center border ${day === temp.best_day ? 'border-green-500/30 bg-green-500/5' : day === temp.worst_day ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}>
                                                <div className="text-xs font-bold text-muted-foreground mb-2">{day.slice(0, 3).toUpperCase()}</div>
                                                <div className={`text-xl font-bold font-mono ${d.avg_return >= 0 ? 'text-green-500' : 'text-red-500'}`}>{d.avg_return >= 0 ? '+' : ''}{d.avg_return}%</div>
                                                <div className="text-xs text-muted-foreground mt-1">WR: {d.win_rate}%</div>
                                                <div className="text-xs text-muted-foreground">n={d.sample_size}</div>
                                            </div>
                                        ))}</div>
                                    </div>

                                    <div className="bg-card border border-border rounded-2xl p-6">
                                        <h3 className="text-lg font-bold mb-4">Gap Analysis</h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="bg-background rounded-xl p-4 border border-border"><div className="text-xs text-muted-foreground uppercase mb-1">Gap-Up Count</div><div className="text-xl font-bold font-mono text-green-500">{temp.gap_analysis.gap_up_count}</div></div>
                                            <div className="bg-background rounded-xl p-4 border border-border"><div className="text-xs text-muted-foreground uppercase mb-1">Gap-Up Fill Rate</div><div className="text-xl font-bold font-mono">{temp.gap_analysis.gap_up_fill_rate}%</div></div>
                                            <div className="bg-background rounded-xl p-4 border border-border"><div className="text-xs text-muted-foreground uppercase mb-1">Gap-Down Count</div><div className="text-xl font-bold font-mono text-red-500">{temp.gap_analysis.gap_down_count}</div></div>
                                            <div className="bg-background rounded-xl p-4 border border-border"><div className="text-xs text-muted-foreground uppercase mb-1">Gap-Down Fill Rate</div><div className="text-xl font-bold font-mono">{temp.gap_analysis.gap_down_fill_rate}%</div></div>
                                        </div>
                                    </div>

                                    {Object.keys(temp.week_of_month).length > 0 && (
                                        <div className="bg-card border border-border rounded-2xl p-6">
                                            <h3 className="text-lg font-bold mb-4">Week-of-Month Returns</h3>
                                            <div className="grid grid-cols-4 gap-3">{Object.entries(temp.week_of_month).map(([w, d]) => (
                                                <div key={w} className="rounded-xl p-4 text-center border border-border"><div className="text-xs font-bold text-muted-foreground mb-2">{w}</div>
                                                    <div className={`text-lg font-bold font-mono ${d.avg_return >= 0 ? 'text-green-500' : 'text-red-500'}`}>{d.avg_return >= 0 ? '+' : ''}{d.avg_return}%</div>
                                                    <div className="text-xs text-muted-foreground">WR: {d.win_rate}% | n={d.sample_size}</div></div>
                                            ))}</div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* Tab 3: Pattern Library */}
                            {tab === 3 && pat && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    <div className="flex items-center justify-between"><h2 className="text-2xl font-bold">Pattern Library</h2><Badge variant="outline" className="font-mono">{pat.total_patterns_detected} patterns with 3+ signals</Badge></div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {pat.patterns.filter(p => p.occurrences >= 3).map((p, i) => {
                                            const good = p.win_rate > 55 && p.expectancy > 0;
                                            return (
                                                <div key={i} className={`bg-card border rounded-xl p-5 ${good ? 'border-green-500/30 ring-1 ring-green-500/10' : 'border-border'} ${p.occurrences === 0 ? 'opacity-50' : ''}`}>
                                                    {good && <Badge className="bg-green-500/10 text-green-400 border-green-500/20 mb-2 text-xs">Alpha Edge</Badge>}
                                                    <h3 className="text-lg font-bold mb-3">{p.pattern}</h3>
                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                        <div className="bg-background rounded-lg p-3 border border-border"><div className="text-[10px] text-muted-foreground uppercase">Win Rate</div><div className={`text-lg font-bold font-mono ${p.win_rate > 55 ? 'text-green-500' : p.win_rate > 45 ? 'text-yellow-500' : 'text-red-500'}`}>{p.win_rate}%</div></div>
                                                        <div className="bg-background rounded-lg p-3 border border-border"><div className="text-[10px] text-muted-foreground uppercase">Expectancy</div><div className={`text-lg font-bold font-mono ${p.expectancy > 0 ? 'text-green-500' : 'text-red-500'}`}>{p.expectancy > 0 ? '+' : ''}{p.expectancy}%</div></div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                                                        <div><span className="block text-[10px] uppercase">Signals</span><span className="font-mono text-foreground">{p.occurrences}</span></div>
                                                        <div><span className="block text-[10px] uppercase">Avg Win</span><span className="font-mono text-green-500">{p.avg_win > 0 ? '+' : ''}{p.avg_win}%</span></div>
                                                        <div><span className="block text-[10px] uppercase">Avg Loss</span><span className="font-mono text-red-500">{p.avg_loss}%</span></div>
                                                    </div>
                                                    <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>R:R {p.risk_reward}x</span><span>{p.consistency}</span></div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}

                            {/* Tab 4: Key Levels */}
                            {tab === 4 && lvl && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-card border border-border rounded-xl p-5 text-center"><div className="text-xs text-muted-foreground uppercase mb-2">Current Price</div><div className="text-3xl font-bold font-mono">₹{lvl.current_price.toLocaleString()}</div></div>
                                        {lvl.nearest_support && <div className="bg-green-500/5 border border-green-500/30 rounded-xl p-5 text-center"><div className="text-xs text-green-400 uppercase mb-2">Nearest Support</div><div className="text-2xl font-bold font-mono text-green-500">₹{lvl.nearest_support.price.toLocaleString()}</div><div className="text-xs text-muted-foreground mt-1">{lvl.nearest_support.distance_pct}% away • {lvl.nearest_support.strength}</div></div>}
                                        {lvl.nearest_resistance && <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-5 text-center"><div className="text-xs text-red-400 uppercase mb-2">Nearest Resistance</div><div className="text-2xl font-bold font-mono text-red-500">₹{lvl.nearest_resistance.price.toLocaleString()}</div><div className="text-xs text-muted-foreground mt-1">{lvl.nearest_resistance.distance_pct > 0 ? '+' : ''}{lvl.nearest_resistance.distance_pct}% away • {lvl.nearest_resistance.strength}</div></div>}
                                    </div>
                                    <div className="bg-card border border-border rounded-2xl p-6">
                                        <h3 className="text-lg font-bold mb-4">All Detected Levels</h3>
                                        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground bg-background"><tr><th className="px-4 py-3 text-left">Price</th><th className="px-4 py-3 text-center">Type</th><th className="px-4 py-3 text-center">Touches</th><th className="px-4 py-3 text-center">Strength</th><th className="px-4 py-3 text-right">Distance</th></tr></thead>
                                            <tbody className="divide-y divide-border">{lvl.levels.map((l, i) => (
                                                <tr key={i} className="hover:bg-muted/30"><td className="px-4 py-3 font-mono font-bold">₹{l.price.toLocaleString()}</td><td className="px-4 py-3 text-center"><Badge className={l.type === 'support' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}>{l.type}</Badge></td><td className="px-4 py-3 text-center font-mono">{l.touches}</td><td className="px-4 py-3 text-center"><Badge variant="outline">{l.strength}</Badge></td><td className={`px-4 py-3 text-right font-mono ${l.distance_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>{l.distance_pct > 0 ? '+' : ''}{l.distance_pct}%</td></tr>
                                            ))}</tbody></table></div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Tab 5: Risk Profile */}
                            {tab === 5 && vol && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[{ label: 'ATR (₹)', value: `₹${vol.current_atr}`, sub: `${vol.current_atr_pct}% of price` },
                                        { label: 'Hist. Volatility', value: `${vol.historical_volatility}%`, sub: 'Annualized' },
                                        { label: 'Avg Daily Range', value: `${vol.avg_daily_range_pct}%`, sub: 'High-Low range' },
                                        { label: 'Vol Trend', value: vol.volatility_trend, sub: 'vs 20-day avg' }
                                        ].map((m, i) => (
                                            <div key={i} className="bg-card border border-border rounded-xl p-4"><div className="text-xs font-semibold text-muted-foreground uppercase mb-1">{m.label}</div><div className="text-xl font-bold font-mono">{m.value}</div><div className="text-xs text-muted-foreground mt-1">{m.sub}</div></div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-5"><div className="text-xs text-red-400 uppercase mb-2">Max Drawdown</div><div className="text-2xl font-bold font-mono text-red-500">{vol.max_drawdown}%</div><div className="text-xs text-muted-foreground mt-1">{vol.max_drawdown_date}</div></div>
                                        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Max Consec. Down Days</div><div className="text-2xl font-bold font-mono">{vol.max_consecutive_down_days}</div></div>
                                        <div className="bg-card border border-border rounded-xl p-5"><div className="text-xs text-muted-foreground uppercase mb-2">Sharpe Ratio</div><div className={`text-2xl font-bold font-mono ${vol.sharpe_ratio > 1 ? 'text-green-500' : vol.sharpe_ratio > 0 ? 'text-yellow-500' : 'text-red-500'}`}>{vol.sharpe_ratio}</div></div>
                                    </div>
                                    <div className="bg-card border border-border rounded-2xl p-6"><div className="grid grid-cols-2 gap-4">
                                        <div><div className="text-xs text-muted-foreground uppercase mb-1">Total Return</div><div className={`text-3xl font-bold font-mono ${vol.total_return >= 0 ? 'text-green-500' : 'text-red-500'}`}>{vol.total_return >= 0 ? '+' : ''}{vol.total_return}%</div></div>
                                        <div><div className="text-xs text-muted-foreground uppercase mb-1">Trading Days Analyzed</div><div className="text-3xl font-bold font-mono">{vol.trading_days}</div></div>
                                    </div></div>
                                </motion.div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
