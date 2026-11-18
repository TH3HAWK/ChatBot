"use strict";

const CUSTOM_BACKEND_URL = "";

function getApiBaseUrl() {
  if (CUSTOM_BACKEND_URL.trim() !== "") return CUSTOM_BACKEND_URL.replace(/\/+$/, "");
  if (["127.0.0.1", "localhost"].includes(window.location.hostname)) return "http://127.0.0.1:8000";
  return window.location.origin;
}

const API_BASE_URL = getApiBaseUrl();

// Elementos do DOM
const dom = {
  messages: document.getElementById("chat-messages"),
  form: document.getElementById("chat-form"),
  input: document.getElementById("user-input"),
  sendBtn: document.getElementById("send-btn"),
  clearBtn: document.getElementById("clear-chat-btn"),
  themeBtn: document.getElementById("theme-toggle-btn"),
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  menuBtn: document.getElementById("toggle-trending-btn"),
  menu: document.getElementById("trending-menu"),
  topicsContainer: document.getElementById("topics-list-container")
};

const DEFAULT_WELCOME = "Olá! Sou o assistente virtual da Secretaria Acadêmica da UFMS. Digite sua dúvida ou clique no menu lateral de atalhos.";

// ----------------------------------------------------------------------
// GESTÃO DE ESTADO (Local Storage Persistence)
// ----------------------------------------------------------------------
const STORAGE_KEY = "@UFMS_Chat_Trending";

// Base inicial (Seed) para o primeiro acesso
const seedTopics = [
  { text: "Acesso ao SISCAD", query: "Link do siscad", count: 0 },
  { text: "Tipos de Requerimentos", query: "Quais os tipos de requerimento?", count: 0 },
  { text: "Histórico / Declaração", query: "Emitir histórico escolar", count: 0 },
  { text: "Matrícula", query: "Como fazer matrícula?", count: 0 },
  { text: "Trancamento", query: "Como funciona o trancamento?", count: 0 },
  { text: "Acesso ao SICERT", query: "Certificados ufms sicert", count: 0 }
];

function getTrendingTopics() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : [...seedTopics];
}

function saveTrendingTopics(topics) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
}

let trendingTopics = getTrendingTopics();
let localKnowledgeBase = null;

// ----------------------------------------------------------------------
// UTILITÁRIOS
// ----------------------------------------------------------------------
function normalizeText(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function loadLocalKnowledge() {
  try {
    const res = await fetch("knowledge_base.json");
    if (res.ok) localKnowledgeBase = await res.json();
  } catch (e) {
    console.warn("Modo Offline: Falha ao carregar fallback local.");
  }
}

// ----------------------------------------------------------------------
// RENDERIZAÇÃO DE INTERFACE
// ----------------------------------------------------------------------
function renderTrendingMenu() {
  trendingTopics.sort((a, b) => b.count - a.count);
  dom.topicsContainer.innerHTML = "";
  
  trendingTopics.slice(0, 8).forEach((topic, index) => {
    const btn = document.createElement("button");
    btn.className = "theme-btn";
    btn.type = "button";
    btn.innerHTML = `
      <span class="theme-rank">${index + 1}</span>
      <span class="theme-text">${topic.text}</span>
      <span class="theme-score">${topic.count}</span>
    `;
    btn.addEventListener("click", () => {
      topic.count++;
      saveTrendingTopics(trendingTopics);
      closeTrendingMenu();
      renderTrendingMenu();
      sendMessage(topic.query);
    });
    dom.topicsContainer.appendChild(btn);
  });
}

function toggleMenu() {
  const isShowing = dom.menu.classList.contains("show");
  isShowing ? closeTrendingMenu() : openTrendingMenu();
}

function openTrendingMenu() {
  dom.menu.classList.add("show");
  dom.menuBtn.classList.add("active");
  dom.menu.setAttribute("aria-hidden", "false");
}

function closeTrendingMenu() {
  dom.menu.classList.remove("show");
  dom.menuBtn.classList.remove("active");
  dom.menu.setAttribute("aria-hidden", "true");
}

function computeTopicFromText(text) {
  const lowerText = text.toLowerCase();
  let updated = false;
  trendingTopics.forEach(topic => {
    if (lowerText.includes(topic.text.toLowerCase()) || lowerText.includes(topic.query.toLowerCase())) {
      topic.count++;
      updated = true;
    }
  });
  if (updated) {
    saveTrendingTopics(trendingTopics);
    renderTrendingMenu();
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem("ufms-bot-theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
}

dom.themeBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const newTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", newTheme);
  localStorage.setItem("ufms-bot-theme", newTheme);
});

// ----------------------------------------------------------------------
// PARSER INTELIGENTE DE RESPOSTAS (Markdown e Componentes UI)
// ----------------------------------------------------------------------
const ICONS = {
  LINK: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
  INFO: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  MAIL: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
  CLOCK: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  WARNING: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  FOLDER: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
};

function formatBotMessage(rawText) {
  let text = rawText
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  
  // Formatadores de Texto
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Blockquotes (Citações e Modelos de Requerimentos)
  text = text.replace(/^> (.*?)$/gm, '<blockquote class="chat-quote">$1</blockquote>');
  
  // Substituição de Ícones
  Object.keys(ICONS).forEach(key => {
    const regex = new RegExp(`\\[ICON_${key}\\]`, 'g');
    text = text.replace(regex, ICONS[key]);
  });

  // Saudação Temporal
  const hora = new Date().getHours();
  const saudacao = (hora >= 12 && hora < 18) ? "uma excelente tarde" : (hora >= 18 || hora < 5) ? "uma excelente noite" : "um excelente dia";
  text = text.replace(/\[SAUDACAO\]/g, saudacao);

  // Botão WhatsApp
  const wppHTML = `<a href="https://wa.me/556732910202" class="wpp-btn" target="_blank">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> 
    Atendimento Humano
  </a>`;
  text = text.replace(/\[WPP_BTN\]/g, wppHTML);
  
  // Conversão Inteligente de múltiplos Botões de Ação para um Grid Flexível
  if (text.includes("[ACTION_BTN:")) {
    const actionRegex = /\[ACTION_BTN:(.+?)\|(.+?)\]/g;
    let buttonsHTML = '<div class="action-buttons-wrapper">';
    let match;
    while ((match = actionRegex.exec(text)) !== null) {
      buttonsHTML += `<button type="button" class="chat-action-btn" onclick="window.sendMessage('${match[1]}')">${match[2]}</button>`;
    }
    buttonsHTML += '</div>';
    text = text.replace(/\[ACTION_BTN:(.+?)\|(.+?)\]\n?/g, '').trim(); // Remove raw tags
    text += buttonsHTML; // Anexa o grid formatado no final
  }
  
  // Estruturação de Listas
  if (text.includes("•") || text.includes("- ")) {
    text = text.replace(/^(?:•|-)\s*(.*)$/gm, "<li>$1</li>");
    text = text.replace(/(<li>.*<\/li>(\s*<li>.*<\/li>)*)/g, '<ul class="chat-list">$1</ul>');
  }

  return text;
}

// ----------------------------------------------------------------------
// CONTROLE DO CHAT
// ----------------------------------------------------------------------
function getCurrentTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function appendMessage(sender, text, metaInfo = null) {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;
  
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = sender === "bot" ? formatBotMessage(text) : text;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.innerHTML = `<span>${getCurrentTime()}</span>`;

  if (sender === "bot" && metaInfo?.category) {
    const tag = document.createElement("span");
    tag.className = "intent-tag";
    tag.textContent = metaInfo.category;
    meta.appendChild(tag);
  }

  row.appendChild(bubble);
  row.appendChild(meta);
  dom.messages.appendChild(row);
  
  // Timeout garante que scroll desça mesmo após renderizar botões e blocos complexos
  setTimeout(() => dom.messages.scrollTop = dom.messages.scrollHeight, 10);
}

function showTypingIndicator() {
  const row = document.createElement("div");
  row.className = "message-row bot";
  row.id = "typing-row";
  row.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  dom.messages.appendChild(row);
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typing-row");
  if (indicator) indicator.remove();
}

async function sendMessage(messageText) {
  const trimmed = messageText.trim();
  if (!trimmed) return;

  computeTopicFromText(trimmed);

  appendMessage("user", trimmed);
  dom.input.value = "";
  dom.input.disabled = true;
  dom.sendBtn.disabled = true;
  showTypingIndicator();

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed }),
    });

    if (!response.ok) throw new Error("Server Error");
    
    const data = await response.json();
    removeTypingIndicator();
    appendMessage("bot", data.response, { category: data.category });

  } catch (error) {
    removeTypingIndicator();
    
    // Fallback Engine JS 
    if (localKnowledgeBase) {
      const textNorm = normalizeText(trimmed);
      let answer = localKnowledgeBase.bot_info.fallback_message;
      let category = "Encaminhamento";

      for (const intent of localKnowledgeBase.intents) {
        const match = intent.keywords.some(kw => textNorm.includes(normalizeText(kw)));
        if (match) {
          answer = intent.response;
          category = intent.category;
          break;
        }
      }
      appendMessage("bot", answer, { category: category + " (Modo Offline)" });
    } else {
      appendMessage("bot", "Serviço indisponível. Contate a secretaria.", { category: "Erro" });
    }
  } finally {
    dom.input.disabled = false;
    dom.sendBtn.disabled = false;
    dom.input.focus();
  }
}

window.sendMessage = sendMessage;

async function initChat() {
  dom.messages.innerHTML = "";
  renderTrendingMenu();
  initTheme();
  
  await loadLocalKnowledge();
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/info`);
    if (response.ok) {
      const info = await response.json();
      dom.statusDot.style.backgroundColor = "var(--online-green)";
      dom.statusText.textContent = "Online • Secretaria Acadêmica";
      appendMessage("bot", info.welcome_message || DEFAULT_WELCOME, { category: "Sistemas Inativos" });
      return;
    }
    throw new Error("Backend Inválido");
  } catch (err) {
    dom.statusDot.style.backgroundColor = "#f59e0b";
    dom.statusText.textContent = "Modo Local Ativado";
    const welcome = localKnowledgeBase ? localKnowledgeBase.bot_info.welcome_message : DEFAULT_WELCOME;
    appendMessage("bot", welcome, { category: "Inicialização" });
  }
}

// ----------------------------------------------------------------------
// EVENT LISTENERS
// ----------------------------------------------------------------------
dom.form.addEventListener("submit", (e) => {
  e.preventDefault();
  closeTrendingMenu(); 
  sendMessage(dom.input.value);
});

dom.clearBtn.addEventListener("click", initChat);
dom.menuBtn.addEventListener("click", toggleMenu);
document.addEventListener("click", (e) => {
  if (!dom.menu.contains(e.target) && !dom.menuBtn.contains(e.target)) {
    closeTrendingMenu();
  }
});

window.addEventListener("DOMContentLoaded", initChat);