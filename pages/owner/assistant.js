import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaRobot, FaArrowUp, FaPlus, FaTrash, FaStop, FaHistory } from 'react-icons/fa';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AnswerText from '../../components/Assistant/AnswerText';
import api from '../../utils/api';
import {
  AI_ASSISTANT_ROLES,
  isAiAssistantEnabled,
  deleteConversation,
  getAssistantUsage,
  getConversation,
  listConversations,
  streamChat,
} from '../../utils/aiAssistantApi';

const SUGGESTIONS = [
  "How were today's sales?",
  'Top 10 items this week',
  'Compare this week with last week',
  'Which items are low on stock?',
  'Which tables are occupied right now?',
  'Payment methods used yesterday',
];

export default function AssistantPage() {
  return (
    <RoleGate allowedRoles={AI_ASSISTANT_ROLES}>
      <AssistantContent />
    </RoleGate>
  );
}

function AssistantContent() {
  const [enabled, setEnabled] = useState(null); // null = checking Settings > Enable MCP

  useEffect(() => {
    api.get('/api/v1/configurations', { skipCache: true })
      .then((res) => setEnabled(isAiAssistantEnabled(res?.data?.data)))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled === null) {
    return <DashboardLayout title="Ask CafeQR"><p style={{ color: '#64748b' }}>Loading…</p></DashboardLayout>;
  }
  if (!enabled) {
    return (
      <DashboardLayout title="Ask CafeQR">
        <div style={{ maxWidth: 520, margin: '48px auto', textAlign: 'center', color: '#0f172a' }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Ask CafeQR is coming soon</h2>
          <p style={{ color: '#64748b', marginBottom: 16 }}>The AI assistant is not available yet. Your reports are still in Reports.</p>
          <Link href="/owner/reports" style={{ color: '#FF7A00', fontWeight: 600 }}>Open Reports</Link>
        </div>
      </DashboardLayout>
    );
  }
  return <AssistantChat />;
}

function Composer({ value, onChange, onSend, onStop, busy, disabled, large, autoFocus }) {
  const ref = useRef(null);

  // Grow with the text, like a chat bar (up to ~8 lines, then scroll).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className={`composer ${large ? 'large' : ''} ${disabled ? 'disabled' : ''}`}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={disabled ? 'Monthly question limit reached' : 'Ask about your sales, items, stock or tables…'}
        rows={1}
        maxLength={1000}
        disabled={disabled}
        aria-label="Ask CafeQR"
      />
      {busy ? (
        <button type="button" className="send stop" onClick={onStop} aria-label="Stop answering" title="Stop">
          <FaStop />
        </button>
      ) : (
        <button type="button" className="send" onClick={onSend} disabled={!value.trim() || disabled} aria-label="Send" title="Send (Enter)">
          <FaArrowUp />
        </button>
      )}

      <style jsx>{`
        .composer {
          position: relative;
          display: flex;
          align-items: flex-end;
          gap: 8px;
          width: 100%;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 8px 8px 8px 20px;
          box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .composer:focus-within {
          border-color: #FF7A00;
          box-shadow: 0 0 0 4px rgba(255, 122, 0, 0.12), 0 4px 16px rgba(255, 122, 0, 0.12);
        }
        .composer.large { border-radius: 999px; padding: 8px 8px 8px 24px; border-color: #fdba74; }
        .composer.large textarea { font-size: 15px; }
        .composer.disabled { background: #f8fafc; }
        textarea {
          flex: 1;
          resize: none;
          border: none;
          outline: none;
          background: transparent;
          font: inherit;
          font-size: 14px;
          line-height: 22px;
          color: #0f172a;
          padding: 9px 0;
          max-height: 200px;
          min-width: 0;
        }
        textarea::placeholder { color: #94a3b8; }
        .send {
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border-radius: 50%;
          border: none;
          background: #FF7A00;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 15px;
          transition: background 0.15s, transform 0.1s;
        }
        .send:hover:not(:disabled) { background: #ea6c00; }
        .send:active:not(:disabled) { transform: scale(0.95); }
        .send:disabled { background: #fed7aa; cursor: default; }
        .send.stop { background: #0f172a; font-size: 12px; }
      `}</style>
    </div>
  );
}

function AssistantChat() {
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]); // { role, content, status? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState('');
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const historyRef = useRef(null);
  const router = useRouter();

  // Question typed in the main-menu search bar ("Ask CafeQR" button) arrives as ?q=
  useEffect(() => {
    const q = router?.query?.q;
    if (typeof q === 'string' && q.trim()) {
      setInput(q.slice(0, 1000));
      router.replace('/owner/assistant', undefined, { shallow: true });
    }
  }, [router?.query?.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshMeta = useCallback(async () => {
    try {
      const [convs, use] = await Promise.all([listConversations(), getAssistantUsage()]);
      setConversations(convs || []);
      setUsage(use);
    } catch (e) {
      setError(e.message || 'The assistant is not available right now.');
    }
  }, []);

  useEffect(() => { refreshMeta(); }, [refreshMeta]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, toolStatus]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Close the "Recent" menu on outside click / Escape.
  useEffect(() => {
    if (!historyOpen) return undefined;
    const onDown = (e) => { if (historyRef.current && !historyRef.current.contains(e.target)) setHistoryOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setHistoryOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [historyOpen]);

  const openConversation = async (id) => {
    if (busy) return;
    setHistoryOpen(false);
    setError('');
    try {
      const msgs = await getConversation(id);
      setConversationId(id);
      setMessages((msgs || []).map((m) => ({ role: m.role, content: m.content })));
    } catch (e) {
      setError(e.message);
    }
  };

  const newConversation = () => {
    if (busy) return;
    setConversationId(null);
    setMessages([]);
    setInput('');
    setError('');
  };

  const removeConversation = async (id) => {
    try {
      await deleteConversation(id);
      if (id === conversationId) newConversation();
      refreshMeta();
    } catch (e) {
      setError(e.message);
    }
  };

  const updateLastAssistant = (fn) => setMessages((prev) => {
    const next = [...prev];
    const last = next[next.length - 1];
    if (last && last.role === 'assistant') next[next.length - 1] = fn(last);
    return next;
  });

  const ask = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setError('');
    setBusy(true);
    setToolStatus('Thinking…');
    setMessages((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '', status: 'streaming' }]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat({
        message: question,
        conversationId,
        signal: controller.signal,
        onEvent: ({ event, data }) => {
          if (event === 'started' && data?.conversationId) setConversationId(data.conversationId);
          else if (event === 'tool') setToolStatus(`Checking ${String(data?.title || 'your data').toLowerCase()}…`);
          else if (event === 'token') {
            setToolStatus('');
            updateLastAssistant((m) => ({ ...m, content: m.content + (data?.text || '') }));
          } else if (event === 'error') {
            updateLastAssistant((m) => ({ ...m, content: m.content || data?.message || 'Something went wrong.', status: 'error' }));
          } else if (event === 'done') {
            updateLastAssistant((m) => ({ ...m, status: undefined }));
          }
        },
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        updateLastAssistant((m) => ({ ...m, content: m.content || 'Stopped.', status: undefined }));
      } else {
        // Drop the unanswered pair and give the question back so it can be re-sent.
        setMessages((prev) => prev.slice(0, -2));
        setInput(question);
        setError(e.message || 'The assistant is not available right now.');
      }
    } finally {
      setBusy(false);
      setToolStatus('');
      abortRef.current = null;
      refreshMeta();
    }
  };

  const quotaLeft = usage ? Math.max(0, usage.limit - usage.used) : null;
  const limitReached = quotaLeft === 0;
  const chatting = messages.length > 0;
  const composer = (large) => (
    <Composer
      value={input}
      onChange={setInput}
      onSend={() => ask()}
      onStop={() => abortRef.current?.abort()}
      busy={busy}
      disabled={limitReached}
      large={large}
      autoFocus
    />
  );

  return (
    <DashboardLayout title="Ask CafeQR">
      <div className="ask-page">
        <div className="topbar">
          <div className="recent" ref={historyRef}>
            <button
              type="button"
              className="ghost"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-expanded={historyOpen}
              aria-haspopup="menu"
            >
              <FaHistory /> Recent
            </button>
            {historyOpen && (
              <div className="menu" role="menu">
                {conversations.length === 0 && <p className="menu-empty">No chats yet.</p>}
                {conversations.map((c) => (
                  <div key={c.id} className={`menu-item ${c.id === conversationId ? 'active' : ''}`}>
                    <button type="button" className="menu-title" onClick={() => openConversation(c.id)} title={c.title} role="menuitem">
                      {c.title}
                    </button>
                    <button type="button" className="menu-delete" onClick={() => removeConversation(c.id)} aria-label={`Delete chat ${c.title}`}>
                      <FaTrash />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {chatting && (
            <button type="button" className="ghost" onClick={newConversation} disabled={busy}>
              <FaPlus /> New chat
            </button>
          )}
        </div>

        {!chatting ? (
          <div className="home">
            <div className="home-icon"><FaRobot /></div>
            <h1>What would you like to know?</h1>
            <p className="muted">I can read your sales, items, payments, stock, orders and tables. I can&apos;t change anything.</p>
            <div className="home-input">{composer(true)}</div>
            {error && <div className="error-box">{error}</div>}
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy || limitReached}>
                  {s}
                </button>
              ))}
            </div>
            {usage && <p className="muted small">{usage.used} of {usage.limit} questions used this month</p>}
          </div>
        ) : (
          <>
            <div className="thread">
              <div className="column">
                {messages.map((m, i) => (
                  m.role === 'user' ? (
                    <div key={i} className="msg user"><div className="user-bubble">{m.content}</div></div>
                  ) : (
                    <div key={i} className={`msg bot ${m.status === 'error' ? 'error' : ''}`}>
                      <div className="avatar"><FaRobot /></div>
                      <div className="answer">
                        {m.content
                          ? <AnswerText text={m.content} />
                          : <span className="thinking"><span className="dot" /><span className="dot" /><span className="dot" /> {toolStatus || 'Thinking…'}</span>}
                        {m.status === 'streaming' && m.content && toolStatus && <p className="muted small">{toolStatus}</p>}
                      </div>
                    </div>
                  )
                ))}
                <div ref={endRef} />
              </div>
            </div>

            <div className="dock">
              <div className="column">
                {error && <div className="error-box">{error}</div>}
                {composer(false)}
                <p className="muted small footnote">
                  Answers come from your CafeQR data. Check important figures in Reports.
                  {usage && <> · {usage.used}/{usage.limit} this month</>}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .ask-page {
          position: relative;
          display: flex;
          flex-direction: column;
          height: calc(100dvh - 140px);
          min-height: 480px;
        }
        .column { width: 100%; max-width: 760px; margin: 0 auto; }

        .topbar {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-bottom: 4px;
        }
        .ghost {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
        }
        .ghost:hover:not(:disabled) { border-color: #FF7A00; color: #FF7A00; }
        .ghost:disabled { opacity: 0.6; cursor: default; }
        .recent { position: relative; }
        .menu {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          width: 300px;
          max-height: 360px;
          overflow-y: auto;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
          padding: 6px;
          z-index: 20;
        }
        .menu-empty { margin: 0; padding: 10px; color: #64748b; font-size: 13px; }
        .menu-item { display: flex; align-items: center; border-radius: 8px; }
        .menu-item:hover, .menu-item.active { background: #f1f5f9; }
        .menu-title {
          flex: 1; min-width: 0; text-align: left; background: none; border: none;
          padding: 8px 10px; font-size: 13px; color: #0f172a; cursor: pointer;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .menu-delete { background: none; border: none; color: #94a3b8; padding: 8px; cursor: pointer; }
        .menu-delete:hover { color: #ef4444; }

        /* Empty state: everything centered, one big input. */
        .home {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 12px;
          padding: 0 16px 8vh;
        }
        .home-icon {
          width: 52px; height: 52px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #fff4ea; color: #FF7A00; font-size: 24px;
        }
        .home h1 { margin: 0; font-size: 26px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
        .home > p { margin: 0; }
        .home-input { width: 100%; max-width: 680px; margin-top: 12px; }
        .suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 680px; }
        .chip {
          border: 1px solid #e2e8f0; background: #fff; color: #334155; border-radius: 999px;
          padding: 7px 14px; font-size: 13px; cursor: pointer; transition: border-color 0.15s, color 0.15s;
        }
        .chip:hover:not(:disabled) { border-color: #FF7A00; color: #FF7A00; }
        .chip:disabled { opacity: 0.6; cursor: default; }

        /* Chatting: centered thread, composer docked at the bottom. */
        .thread { flex: 1; overflow-y: auto; padding: 16px 16px 8px; }
        .msg { display: flex; margin-bottom: 20px; }
        .msg.user { justify-content: flex-end; }
        .user-bubble {
          max-width: 80%;
          background: #f1f5f9;
          color: #0f172a;
          padding: 10px 16px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .msg.bot { gap: 12px; align-items: flex-start; }
        .avatar {
          width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #fff4ea; color: #FF7A00; font-size: 14px; margin-top: 2px;
        }
        .answer { flex: 1; min-width: 0; font-size: 14px; line-height: 1.65; color: #0f172a; padding-top: 4px; }
        .msg.error .answer { color: #b91c1c; }
        .thinking { display: inline-flex; align-items: center; gap: 4px; color: #64748b; }
        .dot {
          width: 6px; height: 6px; border-radius: 50%; background: #FF7A00;
          animation: blink 1.2s infinite ease-in-out;
        }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; margin-right: 6px; }
        @keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

        .dock {
          padding: 8px 16px 4px;
          background: linear-gradient(to bottom, rgba(248, 250, 252, 0), #f8fafc 24px);
        }
        .footnote { text-align: center; margin: 8px 0 0; }

        .error-box {
          width: 100%; max-width: 680px; margin: 0 auto 8px; padding: 10px 14px; border-radius: 12px;
          background: #fef2f2; color: #b91c1c; font-size: 13px; text-align: left;
        }
        .muted { color: #64748b; }
        .small { font-size: 12px; }

        @media (max-width: 768px) {
          .ask-page { height: calc(100dvh - 120px); }
          .home h1 { font-size: 21px; }
          .thread { padding: 12px 4px 8px; }
          .dock { padding: 8px 4px 4px; }
          .user-bubble { max-width: 88%; }
          .menu { width: min(300px, calc(100vw - 32px)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .dot { animation: none; opacity: 0.6; }
        }
      `}</style>
    </DashboardLayout>
  );
}
