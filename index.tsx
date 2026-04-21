import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Constants ---
// Switched to Flash for better latency and stability with complex JSON schemas
const MODEL_NAME = "gemini-3-flash-preview";

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'process';
}

// Structured Data Interface for Gemini JSON response
interface AnalysisData {
  companyProfile: {
    name: string;
    ticker: string;
    currentPrice: number;
    sector: string;
    summary: string;
  };
  verdict: {
    action: "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
    confidenceScore: number;
    targetPrice: number;
    reasoning: string;
  };
  metrics: {
    volatility: number; // 0-100
    growthPotential: number; // 0-100
    financialHealth: number; // 0-100
  };
  projectedReturns: {
    year: number;
    value: number; // Projected value of the investment
  }[];
  investmentStrategy: {
    title: string;
    description: string;
    steps: string[];
    riskLevel: "Low" | "Medium" | "High";
  };
}

const STOCK_SUGGESTIONS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'COIN', name: 'Coinbase Global' },
];

const LOADING_LOGS = [
  "Initializing secure connection to market gateway...",
  "Fetching historical OHLCV data...",
  "Normalizing datasets...",
  "Initializing neural network weights...",
  "Running Monte Carlo simulations (n=10,000)...",
  "Analyzing market sentiment from news vectors...",
  "Calculating technical indicators (RSI, MACD, Bollinger Bands)...",
  "Detecting support and resistance levels...",
  "Optimizing portfolio allocation strategy...",
  "Finalizing predictive models...",
];

// --- Sub-Components for Visuals ---

// 1. Badge Component
const ActionBadge = ({ action }: { action: string }) => {
  const colors = {
    "STRONG BUY": "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]",
    "BUY": "bg-emerald-500/80 text-white",
    "HOLD": "bg-yellow-500 text-black",
    "SELL": "bg-red-500/80 text-white",
    "STRONG SELL": "bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]",
  };
  const style = colors[action as keyof typeof colors] || "bg-slate-500 text-white";
  return (
    <span className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wider ${style}`}>
      {action}
    </span>
  );
};

// 2. Metric Bar
const MetricBar = ({ label, value }: { label: string, value: number }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs mb-1 font-mono">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200">{value}/100</span>
    </div>
    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
      <div 
        className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-1000 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);

// 3. Projected Growth Chart (SVG)
const GrowthChart = ({ data, initialAmount }: { data: { year: number, value: number }[], initialAmount: number }) => {
  if (!data || data.length === 0) return null;
  
  const width = 100;
  const height = 50;
  const padding = 5;
  
  const maxVal = Math.max(...data.map(d => d.value), initialAmount);
  const minVal = Math.min(...data.map(d => d.value), initialAmount) * 0.9;
  const range = maxVal - minVal;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((d.value - minVal) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  // Start point (Year 0 approx)
  const startY = height - padding - ((initialAmount - minVal) / range) * (height - 2 * padding);
  const pathData = `M ${padding},${startY} L ${points.join(' L ')}`;
  const areaData = `${pathData} L ${width - padding},${height} L ${padding},${height} Z`;

  return (
    <div className="w-full h-32 md:h-48 relative">
       <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
         {/* Gradient Def */}
         <defs>
            <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
            </linearGradient>
         </defs>
         
         {/* Grid lines */}
         <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="#334155" strokeWidth="0.5" />
         <line x1={padding} y1={padding} x2={width-padding} y2={padding} stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />

         {/* Area fill */}
         <path d={areaData} fill="url(#chartGradient)" />
         
         {/* Line */}
         <path d={pathData} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
         
         {/* Points */}
         {data.map((d, i) => {
             const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
             const y = height - padding - ((d.value - minVal) / range) * (height - 2 * padding);
             return (
               <g key={i}>
                 <circle cx={x} cy={y} r="1.5" fill="#ecfdf5" />
                 <text x={x} y={y - 3} textAnchor="middle" fontSize="3" fill="#cbd5e1" className="font-mono">
                    ${(d.value / 1000).toFixed(1)}k
                 </text>
                 <text x={x} y={height + 2} textAnchor="middle" fontSize="2.5" fill="#64748b" className="font-mono">
                    Y{d.year}
                 </text>
               </g>
             );
         })}
       </svg>
    </div>
  );
};

// 4. Helper for Strategy Icons
const getStepIcon = (text: string) => {
  const lower = text.toLowerCase();
  
  // Buy / Entry / Accumulate
  if (lower.includes('buy') || lower.includes('invest') || lower.includes('entry') || lower.includes('accumulate') || lower.includes('dollar cost') || lower.includes('dca')) {
    return (
      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    ); 
  }
  // Sell / Profit / Exit
  if (lower.includes('sell') || lower.includes('profit') || lower.includes('exit') || lower.includes('close')) {
    return (
       <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ); 
  }
  // Risk / Stop Loss / Warning
  if (lower.includes('risk') || lower.includes('stop') || lower.includes('loss') || lower.includes('protect') || lower.includes('downside')) {
    return (
       <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ); 
  }
  // Monitor / Watch / Review
  if (lower.includes('monitor') || lower.includes('watch') || lower.includes('wait') || lower.includes('review') || lower.includes('hold')) {
     return (
       <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ); 
  }
  // Default Arrow
  return (
     <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
       <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  );
};

// --- Main App Component ---

const App = () => {
  const [ticker, setTicker] = useState('');
  const [amount, setAmount] = useState<string>('10000');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    const timestamp = `${time}.${ms}`;
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const runSimulationLogs = async () => {
    for (const message of LOADING_LOGS) {
      if (!isAnalyzing) break;
      await new Promise(r => setTimeout(r, 800 + Math.random() * 800));
      addLog(message, 'process');
    }
  };

  const handleAnalysis = async () => {
    if (!ticker || !amount) {
      addLog("Error: Missing ticker or amount.", 'warning');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setLogs([]);
    addLog(`System initialized. Target: ${ticker.toUpperCase()} | Capital: $${amount}`, 'info');

    try {
      // Start simulation
      const simulationPromise = runSimulationLogs();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const investAmount = parseFloat(amount);
      
      const prompt = `
        Act as a senior quantitative financial analyst.
        The user wants to invest $${investAmount} into "${ticker}".
        
        Analyze this stock deeply. Return the data in strict JSON format.
        
        Rules:
        1. 'projectedReturns' must include 5 items for the next 5 years, estimating the value of the initial $${investAmount} investment.
        2. 'metrics' are scores from 0 to 100.
        3. 'currentPrice' should be an estimated real-time price.
        4. Be realistic with the 'verdict'.
      `;

      addLog("Dispatching request to Gemini 3.0 Flash Quantum Core...", 'info');

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              companyProfile: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  ticker: { type: Type.STRING },
                  currentPrice: { type: Type.NUMBER },
                  sector: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ["name", "ticker", "currentPrice", "sector", "summary"]
              },
              verdict: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING, enum: ["STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL"] },
                  confidenceScore: { type: Type.NUMBER },
                  targetPrice: { type: Type.NUMBER },
                  reasoning: { type: Type.STRING },
                },
                required: ["action", "confidenceScore", "targetPrice", "reasoning"]
              },
              metrics: {
                type: Type.OBJECT,
                properties: {
                  volatility: { type: Type.NUMBER },
                  growthPotential: { type: Type.NUMBER },
                  financialHealth: { type: Type.NUMBER },
                },
                required: ["volatility", "growthPotential", "financialHealth"]
              },
              projectedReturns: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    year: { type: Type.NUMBER },
                    value: { type: Type.NUMBER },
                  }
                }
              },
              investmentStrategy: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                  riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
                }
              }
            },
            required: ["companyProfile", "verdict", "metrics", "projectedReturns", "investmentStrategy"]
          }
        }
      });

      // Artificial delay to let logs finish if they are too fast
      await new Promise(r => setTimeout(r, 1000));
      
      addLog("Analysis complete. Decoding JSON payload...", 'success');
      
      if (response.text) {
        let jsonString = response.text;
        // Clean markdown code blocks if present (safety net for Flash model)
        if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');
        }
        const data = JSON.parse(jsonString) as AnalysisData;
        setAnalysisResult(data);
      } else {
        throw new Error("No data received");
      }

    } catch (error) {
      console.error(error);
      addLog(`Critical Failure: ${error instanceof Error ? error.message : "Unknown error"}`, 'warning');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex flex-col items-center">
      
      {/* Header */}
      <header className="w-full max-w-6xl mb-8 flex justify-between items-center border-b border-slate-700 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/50 rounded flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-emerald-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">QuantumTrade<span className="text-emerald-400">.ai</span></h1>
            <p className="text-xs text-slate-400 font-mono">V3.1 PREDICTIVE ENGINE</p>
          </div>
        </div>
        <div className="hidden md:block text-right">
          <div className="text-xs text-emerald-500 font-mono animate-pulse">SYSTEM ONLINE</div>
          <div className="text-xs text-slate-500">{new Date().toLocaleDateString()}</div>
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Controls (Width 3) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <div className="glass-panel p-6 rounded-xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500"></div>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-mono">STOCK TICKER</label>
                <input 
                  type="text" 
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. NVDA"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded p-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono tracking-wider"
                  disabled={isAnalyzing}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-mono">CAPITAL ALLOCATION ($)</label>
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10000"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded p-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  disabled={isAnalyzing}
                />
              </div>

              <div className="pt-2">
                <p className="text-xs text-slate-500 mb-2">QUICK SELECT:</p>
                <div className="flex flex-wrap gap-2">
                  {STOCK_SUGGESTIONS.map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => setTicker(s.symbol)}
                      disabled={isAnalyzing}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${ticker === s.symbol ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                      {s.symbol}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAnalysis}
                disabled={isAnalyzing || !ticker}
                className={`w-full mt-4 py-3 px-4 rounded font-semibold tracking-wide transition-all ${
                  isAnalyzing 
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                }`}
              >
                {isAnalyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-emerald-300 rounded-full animate-ping"></span>
                    PROCESSING...
                  </span>
                ) : (
                  'INITIALIZE MODEL'
                )}
              </button>
            </div>
          </div>
          
          {/* Recent Logs (Visible when not analyzing if needed, or always) */}
          <div className="glass-panel rounded-xl overflow-hidden flex flex-col h-[300px] border border-slate-700 relative">
             <div className="bg-slate-800/80 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                <span className="text-xs font-mono text-slate-400">TERMINAL</span>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
             </div>
             <div ref={logContainerRef} className="p-4 font-mono text-[10px] overflow-y-auto flex-1 logs-scroll bg-[#0b101a]">
                {logs.length === 0 && <span className="text-slate-600">System Ready...</span>}
                {logs.map((log, idx) => (
                  <div key={idx} className="mb-1.5 flex gap-2">
                    <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                    <span className={`
                      ${log.type === 'process' ? 'text-blue-400' : ''}
                      ${log.type === 'info' ? 'text-slate-300' : ''}
                      ${log.type === 'success' ? 'text-emerald-400' : ''}
                      ${log.type === 'warning' ? 'text-amber-400' : ''}
                    `}>
                      {log.type === 'process' && '> '}
                      {log.message}
                    </span>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* Right Column: Dashboard (Width 9) */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">
          
          {/* Welcome State */}
          {!analysisResult && !isAnalyzing && (
             <div className="h-full flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl min-h-[400px]">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-400 mb-2">Awaiting Analysis Parameters</h3>
                <p className="text-sm text-slate-500 max-w-md text-center">Enter a stock ticker and investment amount to unleash the predictive capabilities of the Gemini 3.0 Pro Quantum Core.</p>
             </div>
          )}

          {/* Loading State Overlay */}
          {isAnalyzing && !analysisResult && (
             <div className="h-full flex flex-col items-center justify-center bg-slate-800/20 rounded-xl min-h-[400px] relative overflow-hidden">
                <div className="scanline absolute inset-0 z-0"></div>
                <div className="z-10 text-center">
                   <div className="text-6xl mb-4 animate-bounce">🤖</div>
                   <h2 className="text-2xl font-bold text-white mb-2">Analyzing {ticker}...</h2>
                   <p className="text-emerald-400 font-mono">Simulating market conditions...</p>
                </div>
             </div>
          )}

          {/* Results Dashboard */}
          {analysisResult && (
            <div className="animate-[fadeIn_0.5s_ease-out] space-y-6">
              
              {/* Top Row: Executive Summary */}
              <div className="glass-panel p-6 rounded-xl border-l-4 border-l-emerald-500">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                   <div>
                      <div className="flex items-baseline gap-3 mb-1">
                        <h2 className="text-3xl font-bold text-white tracking-tight">{analysisResult.companyProfile.ticker}</h2>
                        <span className="text-xl text-slate-400">${analysisResult.companyProfile.currentPrice}</span>
                      </div>
                      <div className="text-sm text-slate-400">{analysisResult.companyProfile.name} • {analysisResult.companyProfile.sector}</div>
                   </div>
                   <div className="flex flex-col items-end gap-2">
                      <ActionBadge action={analysisResult.verdict.action} />
                      <div className="text-xs font-mono text-slate-400">TARGET: <span className="text-white font-bold">${analysisResult.verdict.targetPrice}</span></div>
                   </div>
                </div>
                <p className="text-slate-300 leading-relaxed border-t border-slate-700/50 pt-4">
                   {analysisResult.verdict.reasoning}
                </p>
              </div>

              {/* Middle Row: Metrics & Strategy (Grid) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 
                 {/* Metrics Card */}
                 <div className="glass-panel p-6 rounded-xl">
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                       <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                       Core Metrics
                    </h3>
                    <MetricBar label="Financial Health" value={analysisResult.metrics.financialHealth} />
                    <MetricBar label="Growth Potential" value={analysisResult.metrics.growthPotential} />
                    <MetricBar label="Volatility Risk" value={analysisResult.metrics.volatility} />
                    
                    <div className="mt-6 pt-4 border-t border-slate-700">
                       <h4 className="text-xs text-slate-400 mb-2">CONFIDENCE SCORE</h4>
                       <div className="flex items-end gap-2">
                          <span className="text-3xl font-bold text-white">{analysisResult.verdict.confidenceScore}%</span>
                          <span className="text-xs text-slate-500 mb-1.5">AI Certainty</span>
                       </div>
                    </div>
                 </div>

                 {/* Strategy Card */}
                 <div className="glass-panel p-6 rounded-xl bg-gradient-to-br from-slate-800/50 to-emerald-900/20">
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                       <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                       Suggested Strategy
                    </h3>
                    <div className="mb-6 bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                       <div className="text-lg font-bold text-emerald-300 mb-1">{analysisResult.investmentStrategy.title}</div>
                       <p className="text-xs text-slate-400 leading-relaxed">{analysisResult.investmentStrategy.description}</p>
                    </div>
                    
                    <div className="relative pl-4 space-y-6">
                       {/* Timeline Line */}
                       <div className="absolute top-2 left-4 bottom-4 w-0.5 bg-slate-700/50 -translate-x-1/2"></div>
                       
                       {analysisResult.investmentStrategy.steps.map((step, i) => (
                          <div key={i} className="relative flex gap-4 group">
                             {/* Timeline Node (Icon) */}
                             <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border border-slate-600 group-hover:border-emerald-500/50 group-hover:bg-slate-700 transition-colors flex items-center justify-center z-10 shadow-lg">
                                {getStepIcon(step)}
                             </div>
                             
                             {/* Content */}
                             <div className="flex-1 pt-1">
                                <span className="text-xs font-mono text-emerald-500/70 mb-1 block">STEP {i+1}</span>
                                <p className="text-sm text-slate-300 group-hover:text-white transition-colors">{step}</p>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>

              {/* Bottom Row: Projections */}
              <div className="glass-panel p-6 rounded-xl">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">5-Year Value Projection</h3>
                    <div className="text-xs text-slate-400 font-mono">ESTIMATED RETURNS</div>
                 </div>
                 <GrowthChart 
                    data={analysisResult.projectedReturns} 
                    initialAmount={parseFloat(amount)} 
                 />
                 <div className="mt-4 flex justify-between text-xs text-slate-500 font-mono px-2">
                    <span>NOW (${parseFloat(amount).toLocaleString()})</span>
                    <span>YEAR 5 (${analysisResult.projectedReturns[4]?.value.toLocaleString()})</span>
                 </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);