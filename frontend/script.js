"use strict";

const CUSTOM_BACKEND_URL = "";

function getApiBaseUrl() {
  if (CUSTOM_BACKEND_URL.trim() !== "") {
    return CUSTOM_BACKEND_URL.replace(/\/+$/, "");
  }
  if (
    window.location.protocol === "file:" ||
    (window.location.hostname === "127.0.0.1" && window.location.port !== "8000") ||
    (window.location.hostname === "localhost" && window.location.port !== "8000")
  ) {
    return "http://127.0.0.1:8000";
  }
  return window.location.origin;
}

const API_BASE_URL = getApiBaseUrl();

// Elementos do DOM
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const clearChatBtn = document.getElementById("clear-chat-btn");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const toggleTrendingBtn = document.getElementById("toggle-trending-btn");
const trendingMenu = document.getElementById("trending-menu");
const topicsContainer = document.getElementById("topics-list-container");

const DEFAULT_WELCOME = "Olá! Sou o assistente virtual da Secretaria Acadêmica da UFMS. Digite sua dúvida ou clique no menu de atalhos.";

// Temas em destaque (Rank dinâmico)
let trendingTopics = [
  { text: "Acesso ao SISCAD", query: "Link do siscad", count: 12 },
  { text: "Tipos de Requerimentos", query: "Quais os tipos de requerimento?", count: 10 },
  { text: "Histórico / Declaração", query: "Emitir histórico escolar", count: 9 },
  { text: "Matrícula", query: "Como fazer matrícula?", count: 8 },
  { text: "Trancamento", query: "Como funciona o trancamento?", count: 7 },
  { text: "Acesso ao SICERT", query: "Certificados ufms sicert", count: 6 },
  { text: "Estágio TCE", query: "Documentação de estágio", count: 5 },
  { text: "Calendário", query: "Qual o calendário acadêmico?", count: 2 },
  { text: "Contatos e Whatsapp", query: "Telefone e contato da secretaria", count: 1 }
];

let localKnowledgeBase = null;

function normalizeText(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function loadLocalKnowledge() {
  try {
    const res = await fetch("knowledge_base.json");
    if (res.ok) localKnowledgeBase = await res.json();
  } catch (e) {
    console.error("Modo Offline: Base de conhecimento não carregada remotamente.", e);
  }
}

// ----------------------------------------------------------------------
// RENDERIZAÇÃO DO MENU LATERAL
// ----------------------------------------------------------------------
function renderTrendingMenu() {
  trendingTopics.sort((a, b) => b.count - a.count);
  topicsContainer.innerHTML = "";
  
  trendingTopics.slice(0, 10).forEach((topic, index) => {
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
      closeTrendingMenu();
      renderTrendingMenu();
      sendMessage(topic.query);
    });
    topicsContainer.appendChild(btn);
  });
}

function toggleMenu() {
  const isShowing = trendingMenu.classList.contains("show");
  if (isShowing) {
    closeTrendingMenu();
  } else {
    trendingMenu.classList.add("show");
    toggleTrendingBtn.classList.add("active");
  }
}

function closeTrendingMenu() {
  trendingMenu.classList.remove("show");
  toggleTrendingBtn.classList.remove("active");
}

toggleTrendingBtn.addEventListener("click", toggleMenu);
document.addEventListener("click", (e) => {
  if (!trendingMenu.contains(e.target) && !toggleTrendingBtn.contains(e.target)) {
    closeTrendingMenu();
  }
});

function computeTopicFromText(text) {
  const lowerText = text.toLowerCase();
  let updated = false;
  trendingTopics.forEach(topic => {
    if (lowerText.includes(topic.text.toLowerCase()) || lowerText.includes(topic.query.toLowerCase())) {
      topic.count++;
      updated = true;
    }
  });
  if (updated) renderTrendingMenu();
}

// ----------------------------------------------------------------------
// TEMAS E UI
// ----------------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem("ufms-bot-theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
}

themeToggleBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const newTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", newTheme);
  localStorage.setItem("ufms-bot-theme", newTheme);
});

// ----------------------------------------------------------------------
// PARSER DO BOT (Transforma Textos e Tags em UI Avançada)
// ----------------------------------------------------------------------
const ICONS = {
  LINK: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
  INFO: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  MAIL: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
  CLOCK: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  WARNING: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  FOLDER: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
};

function formatBotMessage(rawText) {
  let text = rawText
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  
  // Negrito
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  
  // Links Auto Clicáveis
  text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Substituição de SVGs (Clean Design)
  text = text.replace(/\[ICON_LINK\]/g, ICONS.LINK);
  text = text.replace(/\[ICON_INFO\]/g, ICONS.INFO);
  text = text.replace(/\[ICON_MAIL\]/g, ICONS.MAIL);
  text = text.replace(/\[ICON_CLOCK\]/g, ICONS.CLOCK);
  text = text.replace(/\[ICON_WARNING\]/g, ICONS.WARNING);
  text = text.replace(/\[ICON_FOLDER\]/g, ICONS.FOLDER);

  // Tratamento da Saudação Dinâmica (Horário real do usuário)
  const hora = new Date().getHours();
  let saudacao = "um excelente dia";
  if (hora >= 12 && hora < 18) saudacao = "uma excelente tarde";
  else if (hora >= 18 || hora < 5) saudacao = "uma excelente noite";
  text = text.replace(/\[SAUDACAO\]/g, saudacao);

  // Botão Interativo do WhatsApp
  const wppHTML = `<a href="https://wa.me/556732910202" class="wpp-btn" target="_blank" rel="noopener noreferrer">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
    </svg> Falar no WhatsApp
  </a>`;
  text = text.replace(/\[WPP_BTN\]/g, wppHTML);
  
  // Botões de Ação Dinâmicos (Para perguntas e fluxos)
  text = text.replace(/\[ACTION_BTN:(.+?)\|(.+?)\]/g, '<button type="button" class="chat-action-btn" onclick="window.sendMessage(\'$1\')">$2</button>');
  
  // Formatação de Listas HTML Avançadas (Substitui • ou - por <li> e engloba em <ul>)
  if (text.includes("•") || text.includes("- ")) {
    text = text.replace(/^(?:•|-)\s*(.*)$/gm, "<li>$1</li>");
    text = text.replace(/(<li>.*<\/li>(\s*<li>.*<\/li>)*)/g, '<ul class="chat-list">$1</ul>');
  }

  return text;
}

function getCurrentTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function appendMessage(sender, text, metaInfo = null) {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (sender === "bot") {
    bubble.innerHTML = formatBotMessage(text);
  } else {
    bubble.textContent = text;
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const timeSpan = document.createElement("span");
  timeSpan.textContent = getCurrentTime();
  meta.appendChild(timeSpan);

  if (sender === "bot" && metaInfo && metaInfo.category) {
    const tag = document.createElement("span");
    tag.className = "intent-tag";
    tag.textContent = metaInfo.category;
    meta.appendChild(tag);
  }

  row.appendChild(bubble);
  row.appendChild(meta);
  chatMessages.appendChild(row);
  scrollToBottom();
}

function showTypingIndicator() {
  const row = document.createElement("div");
  row.className = "message-row bot";
  row.id = "typing-row";
  row.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  chatMessages.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typing-row");
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ----------------------------------------------------------------------
// LÓGICA DE ENVIO E RECEBIMENTO
// ----------------------------------------------------------------------
async function sendMessage(messageText) {
  const trimmed = messageText.trim();
  if (!trimmed) return;

  computeTopicFromText(trimmed);

  appendMessage("user", trimmed);
  userInput.value = "";
  userInput.disabled = true;
  sendBtn.disabled = true;
  showTypingIndicator();

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed }),
    });

    if (!response.ok) throw new Error("Erro HTTP");
    
    const data = await response.json();
    removeTypingIndicator();
    appendMessage("bot", data.response, { category: data.category });

  } catch (error) {
    removeTypingIndicator();
    
    // Fallback: Engine em JavaScript em caso de falha de conexão backend
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
      appendMessage("bot", answer, { category: category + " (Local)" });
    } else {
      appendMessage("bot", "Sistema offline. Tente contatar a secretaria.", { category: "Erro" });
    }
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// Expõe a função globalmente para que os botões dinâmicos injetados no HTML funcionem
window.sendMessage = sendMessage;

async function initChat() {
  chatMessages.innerHTML = "";
  renderTrendingMenu();
  initTheme();
  
  await loadLocalKnowledge();
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/info`);
    if (response.ok) {
      const info = await response.json();
      statusDot.style.backgroundColor = "var(--online-green)";
      statusText.textContent = "Online • Secretaria Acadêmica";
      appendMessage("bot", info.welcome_message || DEFAULT_WELCOME, { category: "Boas-vindas" });
      return;
    }
    throw new Error("Backend indisponível");
  } catch (err) {
    statusDot.style.backgroundColor = "#f59e0b";
    statusText.textContent = "Modo Local Ativado";
    const welcome = localKnowledgeBase ? localKnowledgeBase.bot_info.welcome_message : DEFAULT_WELCOME;
    appendMessage("bot", welcome, { category: "Boas-vindas" });
  }
}

// Controladores de Eventos
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  closeTrendingMenu(); 
  sendMessage(userInput.value);
});

clearChatBtn.addEventListener("click", initChat);
window.addEventListener("DOMContentLoaded", initChat);