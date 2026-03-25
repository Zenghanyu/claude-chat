/* ============================================================
   Claude Chat — Pure Static Version
   Calls Claude API directly from the browser (no backend needed)
   Deploy to GitHub Pages for anywhere access
   ============================================================ */

'use strict';

// ── Config ────────────────────────────────────────────────────
const CFG = {
  // API endpoint — calls Claude directly from browser
  API_URL:       'https://api.aicodemirror.com/api/claudecode',
  STORAGE_KEY:   'claude_chat_v1',
  DEFAULT_MODEL: 'claude-sonnet-4-6',
};

// ── State ──────────────────────────────────────────────────────
let S = {
  sessions:        [],
  currentId:       null,
  apiKey:          '',
  systemPrompt:    '',
  model:           CFG.DEFAULT_MODEL,
  isStreaming:     false,
  abortController: null,
};

// ── Storage ────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(CFG.STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    S.sessions     = d.sessions     || [];
    S.apiKey       = d.apiKey       || '';
    S.systemPrompt = d.systemPrompt || '';
    S.model        = d.model        || CFG.DEFAULT_MODEL;
  } catch (e) { /* ignore */ }
}

function saveState() {
  try {
    localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify({
      sessions:     S.sessions,
      apiKey:       S.apiKey,
      systemPrompt: S.systemPrompt,
      model:        S.model,
    }));
  } catch (e) { /* ignore */ }
}

// ── Session helpers ────────────────────────────────────────────
function genId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function currentSession() {
  return S.sessions.find(s => s.id === S.currentId) || null;
}

function createSession() {
  const s = {
    id:        genId(),
    title:     '新对话',
    messages:  [],
    model:     S.model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  S.sessions.unshift(s);
  S.currentId = s.id;
  saveState();
  return s;
}

function autoRename(session) {
  if (session.title !== '新对话') return;
  const first = session.messages.find(m => m.role === 'user');
  if (first) {
    session.title = first.content.slice(0, 42) + (first.content.length > 42 ? '…' : '');
  }
}

function switchSession(id) {
  if (S.isStreaming) return;
  S.currentId = id;
  renderAll();
  closeSidebar();
}
window.switchSession = switchSession;

function deleteSessionConfirm(id) {
  if (!confirm('确定删除这个对话吗？')) return;
  const idx = S.sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  S.sessions.splice(idx, 1);
  if (S.currentId === id) {
    S.currentId = S.sessions[0]?.id || null;
    if (!S.currentId) createSession();
  }
  saveState();
  renderAll();
}
window.deleteSessionConfirm = deleteSessionConfirm;

// ── Markdown ───────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

function postProcess(el) {
  el.querySelectorAll('pre code').forEach(code => {
    hljs.highlightElement(code);
    const pre     = code.parentElement;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    const lang    = (code.className.match(/language-(\w+)/) || [])[1] || 'code';
    const header  = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `<span class="code-lang">${lang}</span><button class="copy-btn">复制</button>`;
    header.querySelector('.copy-btn').addEventListener('click', function () {
      navigator.clipboard.writeText(code.textContent || '').then(() => {
        this.textContent = '已复制';
        this.classList.add('copied');
        setTimeout(() => { this.textContent = '复制'; this.classList.remove('copied'); }, 2000);
      }).catch(() => showToast('复制失败', 'error'));
    });
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

// ── Rendering ──────────────────────────────────────────────────
function renderAll() {
  renderSidebar();
  renderMessages();
  updateHeader();
}

function updateHeader() {
  const s = currentSession();
  const titleEl = $('headerTitle');
  if (titleEl) titleEl.textContent = s ? s.title : '新对话';
  const sel = $('modelSelect');
  if (sel) sel.value = s?.model || S.model;
}

function renderSidebar() {
  const container = $('sessionsList');
  if (!container) return;
  if (!S.sessions.length) {
    container.innerHTML = '<div class="empty-sessions">暂无对话</div>';
    return;
  }
  const now = Date.now(), DAY = 86400000;
  const groups = [
    { label: '今天',    sessions: [] },
    { label: '昨天',    sessions: [] },
    { label: '最近7天', sessions: [] },
    { label: '更早',    sessions: [] },
  ];
  for (const s of S.sessions) {
    const age = now - s.updatedAt;
    if      (age < DAY)       groups[0].sessions.push(s);
    else if (age < DAY * 2)   groups[1].sessions.push(s);
    else if (age < DAY * 7)   groups[2].sessions.push(s);
    else                      groups[3].sessions.push(s);
  }
  let html = '';
  for (const g of groups) {
    if (!g.sessions.length) continue;
    html += `<div class="session-group-label">${g.label}</div>`;
    for (const s of g.sessions) {
      const active = s.id === S.currentId ? 'active' : '';
      html += `
        <div class="session-item ${active}" onclick="switchSession('${s.id}')">
          <span class="session-title">${esc(s.title)}</span>
          <button class="session-del" onclick="event.stopPropagation();deleteSessionConfirm('${s.id}')" title="删除">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>`;
    }
  }
  container.innerHTML = html;
}

function renderMessages() {
  const welcome = $('welcomeScreen');
  const list    = $('messagesList');
  if (!list) return;
  const s = currentSession();
  if (!s || !s.messages.length) {
    if (welcome) welcome.style.display = 'flex';
    list.innerHTML = '';
    return;
  }
  if (welcome) welcome.style.display = 'none';
  let html = '';
  for (const msg of s.messages) html += buildMessage(msg);
  list.innerHTML = html;
  list.querySelectorAll('.message-content').forEach(postProcess);
  scrollBottom();
}

function buildMessage(msg) {
  const isUser = msg.role === 'user';
  const avatar = isUser ? '我' : 'C';
  const cls    = isUser ? 'user' : 'assistant';
  const name   = isUser ? '你'  : 'Claude';
  const body   = isUser
    ? esc(msg.content).replace(/\n/g, '<br>')
    : renderMarkdown(msg.content);
  return `
    <div class="message">
      <div class="message-header">
        <div class="avatar ${cls}">${avatar}</div>
        <span class="message-role">${name}</span>
      </div>
      <div class="message-content">${body}</div>
    </div>`;
}

function addStreamingDiv() {
  const welcome = $('welcomeScreen');
  const list    = $('messagesList');
  if (welcome) welcome.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'message streaming';
  div.innerHTML = `
    <div class="message-header">
      <div class="avatar assistant">C</div>
      <span class="message-role">Claude</span>
    </div>
    <div class="message-content streaming-cursor" id="streamContent"></div>`;
  list.appendChild(div);
  scrollBottom();
}

function updateStream(text) {
  const el = $('streamContent');
  if (!el) return;
  el.innerHTML = esc(text).replace(/\n/g, '<br>');
  scrollBottom();
}

function finalizeStream(text) {
  const el  = $('streamContent');
  const div = document.querySelector('.message.streaming');
  if (el) {
    el.classList.remove('streaming-cursor');
    el.innerHTML = renderMarkdown(text);
    postProcess(el);
  }
  if (div) div.classList.remove('streaming');
  scrollBottom();
}

function scrollBottom() {
  const c = $('messagesContainer');
  if (c) c.scrollTop = c.scrollHeight;
}

// ── API call (direct, no backend) ──────────────────────────────
function friendlyError(err, statusCode) {
  // Map Anthropic error types to Chinese messages
  const m = err?.message || '';
  if (statusCode === 401 || m.includes('authentication') || m.includes('api_key') || m.includes('x-api-key'))
    return 'API Key 无效，请在设置中重新填写';
  if (statusCode === 429 || m.includes('rate_limit'))
    return '请求太频繁，请稍后重试';
  if (statusCode === 529 || m.includes('overloaded'))
    return '服务暂时繁忙，请稍后重试';
  if (statusCode === 400)
    return `请求格式错误：${m}`;
  if (m) return m;
  return `请求失败 (HTTP ${statusCode || '?'})`;
}

async function sendMessage(content) {
  content = content.trim();
  if (!content || S.isStreaming) return;

  if (!S.apiKey) {
    showToast('请先在设置中配置 API Key', 'error');
    openSettings();
    return;
  }

  let session = currentSession() || createSession();
  session.messages.push({ role: 'user', content });
  session.updatedAt = Date.now();
  autoRename(session);
  saveState();

  renderMessages();
  addStreamingDiv();
  renderSidebar();

  S.isStreaming = true;
  updateSendBtn();

  let text = '';

  try {
    S.abortController = new AbortController();

    // Build Anthropic API request body
    const body = {
      model:      session.model || S.model,
      max_tokens: 8096,
      stream:     true,
      messages:   session.messages,
    };
    if (S.systemPrompt) body.system = S.systemPrompt;

    const res = await fetch(CFG.API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         S.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body:   JSON.stringify(body),
      signal: S.abortController.signal,
    });

    // Handle non-2xx before reading stream
    if (!res.ok) {
      let errObj = {};
      try { errObj = await res.json(); } catch (e) { /* ignore */ }
      throw Object.assign(
        new Error(errObj.error?.message || res.statusText),
        { statusCode: res.status }
      );
    }

    // Read SSE stream
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();           // keep partial line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

        try {
          const d = JSON.parse(data);
          // Anthropic SSE: extract text from content_block_delta
          if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') {
            text += d.delta.text;
            updateStream(text);
          } else if (d.type === 'error') {
            throw Object.assign(new Error(d.error?.message || '发生错误'), { statusCode: d.error?.type });
          }
        } catch (e) {
          if (e.message && e.message !== 'Unexpected end of JSON input') throw e;
        }
      }
    }

    // Success — finalize
    finalizeStream(text);
    session.messages.push({ role: 'assistant', content: text });
    session.updatedAt = Date.now();
    saveState();
    renderSidebar();

  } catch (err) {
    if (err.name === 'AbortError') {
      // User stopped — keep partial text if any
      if (text) {
        finalizeStream(text);
        session.messages.push({ role: 'assistant', content: text });
        session.updatedAt = Date.now();
        saveState();
      } else {
        document.querySelector('.message.streaming')?.remove();
        session.messages.pop();
        saveState();
        if (!session.messages.length) renderMessages();
      }
    } else {
      const msg = friendlyError(err, err.statusCode);
      const el  = $('streamContent');
      if (el) {
        el.classList.remove('streaming-cursor');
        el.innerHTML = `<span style="color:#f87171">⚠️ ${esc(msg)}</span>`;
      }
      document.querySelector('.message.streaming')?.classList.remove('streaming');
      showToast(msg, 'error');
    }
  } finally {
    S.isStreaming = false;
    S.abortController = null;
    updateSendBtn();
    $('messageInput')?.focus();
  }
}

function sendCurrentInput() {
  const inp = $('messageInput');
  if (!inp) return;
  const v = inp.value;
  inp.value = '';
  resize(inp);
  sendMessage(v);
}

function sendSuggestion(text) {
  const inp = $('messageInput');
  if (inp) { inp.value = text; resize(inp); }
  sendCurrentInput();
}
window.sendSuggestion = sendSuggestion;

// ── Send button ────────────────────────────────────────────────
function updateSendBtn() {
  const btn  = $('sendBtn');
  const icon = $('sendIcon');
  if (!btn || !icon) return;
  if (S.isStreaming) {
    btn.classList.add('stop');
    btn.title = '停止生成';
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.innerHTML = '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>';
  } else {
    btn.classList.remove('stop');
    btn.title = '发送';
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.innerHTML = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
  }
}

// ── Settings ───────────────────────────────────────────────────
function openSettings() {
  const overlay = $('modalOverlay');
  const apiInp  = $('apiKeyInput');
  const sysInp  = $('systemPromptInput');
  if (apiInp) apiInp.value = S.apiKey;
  if (sysInp) sysInp.value = S.systemPrompt;
  if (overlay) overlay.classList.add('active');
  setTimeout(() => apiInp?.focus(), 120);
}

function closeSettings() {
  $('modalOverlay')?.classList.remove('active');
}

function saveSettings() {
  const apiInp = $('apiKeyInput');
  const sysInp = $('systemPromptInput');
  if (apiInp) S.apiKey       = apiInp.value.trim();
  if (sysInp) S.systemPrompt = sysInp.value.trim();
  saveState();
  closeSettings();
  showToast('设置已保存', 'success');
}

// ── Sidebar ────────────────────────────────────────────────────
function toggleSidebar() {
  $('sidebar')?.classList.toggle('open');
  $('sidebarOverlay')?.classList.toggle('active');
}
function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sidebarOverlay')?.classList.remove('active');
}

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = $('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

// ── Helpers ────────────────────────────────────────────────────
function $(id)   { return document.getElementById(id); }
function esc(t)  { const d = document.createElement('div'); d.appendChild(document.createTextNode(t)); return d.innerHTML; }
function resize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; }

// ── Events ─────────────────────────────────────────────────────
function bindEvents() {
  $('newChatBtn')?.addEventListener('click', () => {
    if (S.isStreaming) return;
    createSession();
    renderAll();
    closeSidebar();
    $('messageInput')?.focus();
  });
  $('menuBtn')?.addEventListener('click', toggleSidebar);
  $('sidebarOverlay')?.addEventListener('click', closeSidebar);
  $('settingsBtn')?.addEventListener('click', openSettings);
  $('modalClose')?.addEventListener('click', closeSettings);
  $('cancelSettings')?.addEventListener('click', closeSettings);
  $('saveSettingsBtn')?.addEventListener('click', saveSettings);
  $('modalOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeSettings(); });
  $('apiKeyInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveSettings(); });
  $('toggleVisibility')?.addEventListener('click', () => {
    const inp = $('apiKeyInput');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  $('sendBtn')?.addEventListener('click', () => {
    if (S.isStreaming) S.abortController?.abort();
    else               sendCurrentInput();
  });
  const inp = $('messageInput');
  if (inp) {
    inp.addEventListener('input', () => resize(inp));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!S.isStreaming) sendCurrentInput(); }
    });
  }
  $('modelSelect')?.addEventListener('change', e => {
    S.model = e.target.value;
    const s = currentSession();
    if (s) { s.model = S.model; saveState(); }
  });
}

// ── Init ───────────────────────────────────────────────────────
function init() {
  loadState();
  if (!S.sessions.length) createSession();
  else S.currentId = S.sessions[0].id;
  bindEvents();
  renderAll();
  updateSendBtn();
  if (!S.apiKey) setTimeout(() => showToast('请在设置中配置 API Key', 'info'), 600);
  $('messageInput')?.focus();
}

document.addEventListener('DOMContentLoaded', init);
