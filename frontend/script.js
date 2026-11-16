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
const topicsContainer = document.getElementById("sidebar-topics-container");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const DEFAULT_WELCOME = "Olá! Sou o assistente virtual da Secretaria Acadêmica da UFMS. Digite sua dúvida ou escolha um dos temas frequentes ao lado.";

// Base local para rankeamento dos temas (Ranking inicial dinâmico)
let trendingTopics = [
  { text: "Matrícula", query: "Como fazer matrícula e rematrícula?", count: 0 },
  { text: "Histórico / Declaração", query: "Emitir histórico escolar e declaração", count: 0 },
  { text: "Trancamento", query: "Como funciona o trancamento?", count: 0 },
  { text: "Estágio TCE", query: "Documentação de estágio", count: 0 },
  { text: "Aproveitamento", query: "Aproveitamento de estudos", count: 0 },
  { text: "Calendário", query: "Qual o calendário acadêmico?", count: 0 },
  { text: "Passe / Carteirinha", query: "Passe estudantil e carteirinha", count: 0 },
  { text: "Contatos", query: "Telefone e contato da secretaria", count: 1 },
  { text: "Passaporte UFMS", query: "Esqueci a senha do passaporte", count: 0 },
  { text: "Siscad", query: "Como acessar o Siscad?", count: 0 }
];

// Variável para armazenar o JSON localmente
let localKnowledgeBase = null;

// Função para remover acentos e normalizar o texto para as buscas
function normalizeText(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Carrega o JSON localmente para servir como Motor de Resposta Fallback
 */
async function loadLocalKnowledge() {
  try {
    const res = await fetch("knowledge_base.json");
    if (res.ok) {
      localKnowledgeBase = await res.json();
    }
  } catch (e) {
    console.error("Falha ao carregar o JSON local:", e);
  }
}

/**
 * Renderiza a barra lateral ordenando do maior pro menor count
 */
function renderSidebarTopics() {
  trendingTopics.sort((a, b) => b.count - a.count);
  topicsContainer.innerHTML = "";
  
  trendingTopics.slice(0, 10).forEach((topic, index) => {
    const btn = document.createElement("button");
    btn.className = "theme-btn";
    btn.innerHTML = `
      <span class="theme-rank">${index + 1}</span>
      <span class="theme-text">${topic.text}</span>
      <span class="theme-score" title="Buscado ${topic.count} vezes">${topic.count}</span>
    `;
    
    btn.addEventListener("click", () => {
      topic.count++;
      renderSidebarTopics();
      sendMessage(topic.query);
    });

    topicsContainer.appendChild(btn);
  });
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

  if (updated) renderSidebarTopics();
}

function initTheme() {
  const savedTheme = localStorage.getItem("ufms-bot-theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
}

themeToggleBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const isDark = root.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";
  root.setAttribute("data-theme", newTheme);
  localStorage.setItem("ufms-bot-theme", newTheme);
});

function formatBotMessage(rawText) {
  const escaped = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const withBold = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
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
  row.innerHTML = `
    <div class="typing-indicator" aria-label="Assistente digitando">
      <span></span><span></span><span></span>
    </div>
  `;
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
    // Tenta comunicar com o backend Python primeiro
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed }),
    });

    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    
    const data = await response.json();
    removeTypingIndicator();
    appendMessage("bot", data.response, {
      category: data.category,
      confidence: data.confidence,
    });

  } catch (error) {
    removeTypingIndicator();
    
    // SISTEMA LOCAL ENTRA EM AÇÃO
    if (localKnowledgeBase) {
      const textNorm = normalizeText(trimmed);
      let answer = localKnowledgeBase.bot_info.fallback_message;
      let category = "Encaminhamento";

      // Motor de processamento JavaScript (Varre o JSON)
      for (const intent of localKnowledgeBase.intents) {
        const match = intent.keywords.some(kw => textNorm.includes(normalizeText(kw)));
        if (match) {
          answer = intent.response;
          category = intent.category;
          break;
        }
      }
      
      appendMessage("bot", answer, { category: category + " (Modo Local)" });
    } else {
      appendMessage(
        "bot",
        "⚠️ Servidor offline e Base de Dados não encontrada. Tente entrar em contato pelo telefone (67) 3345-7000.",
        { category: "Erro" }
      );
    }
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

async function initChat() {
  chatMessages.innerHTML = "";
  renderSidebarTopics();
  initTheme();
  
  // Inicializa o JSON local antes de tentar conectar
  await loadLocalKnowledge();
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/info`);
    if (response.ok) {
      const info = await response.json();
      statusDot.style.backgroundColor = "#22c55e";
      statusText.textContent = "Online • Secretaria Acadêmica";
      appendMessage("bot", info.welcome_message || DEFAULT_WELCOME, { category: "Boas-vindas" });
      return;
    }
    throw new Error("Backend não respondeu corretamente");
  } catch (err) {
    statusDot.style.backgroundColor = "#f59e0b";
    statusText.textContent = "Modo Local Ativado";
    const welcome = localKnowledgeBase ? localKnowledgeBase.bot_info.welcome_message : DEFAULT_WELCOME;
    appendMessage("bot", welcome, { category: "Boas-vindas (Modo Local)" });
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(userInput.value);
});

clearChatBtn.addEventListener("click", () => {
  initChat();
});

window.addEventListener("DOMContentLoaded", initChat);