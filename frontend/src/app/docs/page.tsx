"use client";

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, ExternalLink, BookOpen, Terminal, Code2, Server } from 'lucide-react';
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function DocsPage() {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    const [guideContent, setGuideContent] = useState('');
    const [activeTab, setActiveTab] = useState<'guide' | 'swagger' | 'redoc'>('guide');

    const jsonStringify = (data: unknown) => {
        try { return JSON.stringify(data); } catch { return ''; }
    };

    useEffect(() => {
        fetch('/docs/algorithm_guide.md')
            .then(res => res.text())
            .then(text => setGuideContent(text))
            .catch(() => setGuideContent("# Documentation Unavailable\nCould not load algorithm guide."));
    }, []);

    return (
        <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
            {/* Header */}
            <header className="flex-none flex items-center justify-between border-b px-6 py-3 bg-card/80 backdrop-blur-sm h-[60px] sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2 border-l border-border pl-4">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <h1 className="text-xl font-bold tracking-tight">Antigravity Docs</h1>
                        <Badge variant="secondary" className="ml-2">v1.2.0</Badge>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Button variant="outline" size="sm" asChild className="hidden sm:flex hover:bg-primary hover:text-primary-foreground transition-colors border-primary/50">
                        <a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer">
                            Open API <ExternalLink className="ml-2 h-3 w-3" />
                        </a>
                    </Button>
                </div>
            </header>

            {/* Sidebar & Content Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar Navigation */}
                <aside className="w-64 border-r bg-muted/20 hidden md:flex flex-col py-6 px-4 gap-2 overflow-y-auto shrink-0">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-2 px-2">Documentation</div>

                    <button
                        onClick={() => setActiveTab('guide')}
                        className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activeTab === 'guide' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                    >
                        <Code2 className="h-4 w-4" /> Algorithm Guide
                    </button>

                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-6 px-2">API References</div>

                    <button
                        onClick={() => setActiveTab('swagger')}
                        className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activeTab === 'swagger' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                    >
                        <Server className="h-4 w-4" /> Swagger UI
                    </button>

                    <button
                        onClick={() => setActiveTab('redoc')}
                        className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activeTab === 'redoc' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                    >
                        <Terminal className="h-4 w-4" /> ReDoc Spec
                    </button>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 relative min-h-0 bg-background overflow-hidden flex flex-col">
                    {/* Mobile Navigation Dropdown (Visible only on small screens) */}
                    <div className="md:hidden flex p-4 border-b bg-muted/10 gap-2 overflow-x-auto no-scrollbar">
                        <Button size="sm" variant={activeTab === 'guide' ? 'default' : 'outline'} onClick={() => setActiveTab('guide')}>Guide</Button>
                        <Button size="sm" variant={activeTab === 'swagger' ? 'default' : 'outline'} onClick={() => setActiveTab('swagger')}>Swagger</Button>
                        <Button size="sm" variant={activeTab === 'redoc' ? 'default' : 'outline'} onClick={() => setActiveTab('redoc')}>ReDoc</Button>
                    </div>

                    {/* Content Views */}
                    {activeTab === 'swagger' && (
                        <div className="flex-1 w-full h-full p-0">
                            <iframe src={`${API_URL}/docs`} className="w-full h-full border-0 bg-white" title="Swagger UI" />
                        </div>
                    )}

                    {activeTab === 'redoc' && (
                        <div className="flex-1 w-full h-full p-0">
                            <iframe src={`${API_URL}/redoc`} className="w-full h-full border-0 bg-white" title="ReDoc Visualization" />
                        </div>
                    )}

                    {activeTab === 'guide' && (
                        <div className="flex-1 p-6 md:p-12 overflow-y-auto custom-scrollbar docs-prose">
                            <div className="max-w-4xl mx-auto pb-20">
                                <ReactMarkdown
                                    components={{
                                        h1: (props) => <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-10 mb-6 pb-2 border-b text-foreground" {...props} />,
                                        h2: (props) => <h2 className="text-2xl font-bold tracking-tight mt-10 mb-4 text-foreground" {...props} />,
                                        h3: (props) => <h3 className="text-xl font-semibold tracking-tight mt-8 mb-4 text-foreground" {...props} />,
                                        p: (props) => <p className="leading-7 [&:not(:first-child)]:mt-6 text-muted-foreground" {...props} />,
                                        ul: (props) => <ul className="my-6 ml-6 list-disc [&>li]:mt-2 text-muted-foreground" {...props} />,
                                        ol: (props) => <ol className="my-6 ml-6 list-decimal [&>li]:mt-2 text-muted-foreground" {...props} />,
                                        li: (props) => <li className="text-muted-foreground" {...props} />,
                                        code: ({ className, children, ...props }) => {
                                            const match = /language-(\w+)/.exec(className || '')
                                            const isInline = !match && !jsonStringify(children)?.includes('\n')
                                            return isInline
                                                ? <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-medium text-primary" {...props}>{children}</code>
                                                : <div className="relative my-6 overflow-hidden rounded-lg bg-zinc-950 dark:bg-zinc-900 border border-zinc-800"><div className="flex items-center px-4 py-2 border-b border-zinc-800 bg-zinc-900 dark:bg-zinc-950"><span className="text-xs font-mono text-zinc-400">{match?.[1] || 'text'}</span></div><pre className="p-4 overflow-x-auto"><code className="font-mono text-sm text-zinc-50" {...props}>{children}</code></pre></div>
                                        },
                                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                        pre: ({ node: _, ...props }) => <pre {...props} />, // Strip node from pros to avoid typing issues
                                        table: (props) => <div className="my-6 w-full overflow-y-auto"><table className="w-full border-collapse" {...props} /></div>,
                                        tr: (props) => <tr className="m-0 border-t p-0 even:bg-muted/50" {...props} />,
                                        th: (props) => <th className="border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right text-foreground" {...props} />,
                                        td: (props) => <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right text-muted-foreground" {...props} />,
                                        blockquote: (props) => <blockquote className="mt-6 border-l-4 border-primary pl-6 italic text-muted-foreground bg-muted/30 py-2 pr-4 rounded-r-lg" {...props} />,
                                        a: (props) => <a className="font-medium text-primary hover:underline underline-offset-4" {...props} />,
                                        hr: (props) => <hr className="my-8 border-border" {...props} />,
                                    }}
                                >
                                    {guideContent}
                                </ReactMarkdown>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
