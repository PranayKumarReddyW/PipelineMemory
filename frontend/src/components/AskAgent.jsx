/**
 * Ask Agent — natural-language chat panel for querying pipeline memory.
 * Powered by Hindsight reflect() when configured; falls back to SQLite + LLM.
 *
 * Includes a "Compare with Stateless AI" mode to clearly demonstrate
 * the value of persistent memory vs generic LLMs.
 */

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Loader2, Bot, User, Sparkles, Brain, ArrowRight } from 'lucide-react';
import { api } from '../hooks/useApi';

const SUGGESTED_QUESTIONS = [
  'Why did payments fail recently?',
  'Which service is most fragile?',
  'What patterns have you learned from past failures?',
  'Give me an overview of the pipeline health',
  'Which config changes caused the most incidents?',
  'What is the blast radius of the payments service?',
  'Summarize all Friday deployments that failed',
  'What should I watch out for before deploying to gateway?',
];

export default function AskAgent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const scrollRef = useRef(null);

  /* Auto-scroll to bottom on new messages */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const askQuestion = async (question) => {
    if (!question.trim()) return;

    const userMessage = { role: 'user', content: question, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const data = await api.post('/ask', { question, compare: compareMode });
      const agentMessage = {
        role: 'agent',
        content: data.answer,
        stateless_answer: data.stateless_answer,
        hindsight_powered: data.hindsight_powered,
        llm_powered: data.llm_powered,
        context_size: data.context_size,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, agentMessage]);
    } catch (err) {
      const errorMessage = {
        role: 'agent',
        content: `Sorry, I encountered an error: ${err.message}`,
        isError: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    askQuestion(input);
  };

  return (
    <div className="space-y-6">
      {/* Header with Comparison Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Ask the Agent
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-pipeline-500/10 text-pipeline-400 border border-pipeline-500/20 font-normal">
              Hindsight Memory
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Query your pipeline memory with natural language
          </p>
        </div>

        {/* Side-by-Side Compare Toggle */}
        <button
          type="button"
          onClick={() => setCompareMode(!compareMode)}
          className={`self-start sm:self-auto px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 border ${
            compareMode
              ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-500/20'
              : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:text-gray-200'
          }`}
          title="Compare responses: With Hindsight Memory vs Stateless Generic AI"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Compare: Memory vs Stateless AI</span>
          <span className={`w-2 h-2 rounded-full ${compareMode ? 'bg-purple-400 animate-pulse' : 'bg-gray-600'}`} />
        </button>
      </div>

      <div className="glass-card flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pipeline-500/20 to-purple-600/20 flex items-center justify-center mb-4 border border-pipeline-500/10">
                <Bot className="w-8 h-8 text-pipeline-400" />
              </div>
              <h3 className="text-gray-300 font-semibold mb-1">Pipeline Memory Agent</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md">
                I have persistent memory of all deployments, failures, and incidents via Hindsight.
                Ask me anything about your pipeline history.
              </p>

              {/* Suggested questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => askQuestion(q)}
                    className="text-left text-xs px-3 py-2.5 bg-gray-800/40 hover:bg-gray-800/60
                               border border-gray-700/30 hover:border-gray-600/40
                               rounded-xl text-gray-400 hover:text-gray-300
                               transition-all duration-200"
                  >
                    <Sparkles className="w-3 h-3 text-pipeline-500 inline mr-1.5" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-pipeline-600/20 border border-pipeline-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-pipeline-400" />
              </div>
              <div className="glass-card px-4 py-3 max-w-2xl">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {compareMode ? 'Querying Hindsight Memory & Stateless AI...' : 'Searching Hindsight memory...'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-800/50 p-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={compareMode ? "Ask a question to see Memory vs Stateless comparison..." : "Ask about deployments, failures, risk factors..."}
              disabled={loading}
              className="form-input flex-1"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Ask
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isAgent = message.role === 'agent';

  return (
    <div className={`flex items-start gap-3 animate-fade-in ${isAgent ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isAgent
          ? 'bg-pipeline-600/20 border border-pipeline-500/20'
          : 'bg-gray-700/40 border border-gray-600/20'
      }`}>
        {isAgent ? (
          <Bot className="w-4 h-4 text-pipeline-400" />
        ) : (
          <User className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Message content */}
      <div className={`flex-1 max-w-4xl ${isAgent ? '' : 'text-right'}`}>
        {isAgent && message.stateless_answer ? (
          /* Side-by-Side Comparison Card */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* With Hindsight Memory */}
            <div className="p-4 rounded-2xl bg-pipeline-950/30 border border-pipeline-500/30 text-left">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-pipeline-400 mb-2">
                <Brain className="w-3.5 h-3.5" />
                With Hindsight Memory
              </div>
              <div className="prose-invert text-xs whitespace-pre-wrap leading-relaxed text-gray-200">
                {message.content}
              </div>
            </div>

            {/* Without Memory (Stateless) */}
            <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 text-left">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-gray-500" />
                Stateless AI (No Memory)
              </div>
              <div className="prose-invert text-xs whitespace-pre-wrap leading-relaxed text-gray-400">
                {message.stateless_answer}
              </div>
            </div>
          </div>
        ) : (
          /* Standard Bubble */
          <div className={`inline-block text-sm rounded-2xl px-4 py-3 text-left ${
            isAgent
              ? message.isError
                ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                : 'glass-card text-gray-200'
              : 'bg-pipeline-600/20 border border-pipeline-500/20 text-gray-200'
          }`}>
            <div className="prose-invert whitespace-pre-wrap leading-relaxed">
              {message.content}
            </div>
          </div>
        )}

        {/* Meta info for agent responses */}
        {isAgent && !message.isError && (
          <div className="flex items-center gap-2 mt-1.5 text-[10px] pl-1 text-left">
            {message.hindsight_powered && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-pipeline-600/15 text-pipeline-400 border border-pipeline-500/20">
                <Brain className="w-3 h-3" />
                Hindsight Memory
              </span>
            )}
            {!message.hindsight_powered && message.llm_powered !== undefined && (
              <span className="text-gray-600">{message.llm_powered ? '✨ LLM-powered' : '📐 Rule-based'}</span>
            )}
            {message.context_size && (
              <span className="text-gray-600">
                {message.context_size.deployments} deploys · {message.context_size.failures} failures · {message.context_size.incidents} incidents
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
