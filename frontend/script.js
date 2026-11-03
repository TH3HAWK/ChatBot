/**
 * Configuração da URL da API Backend.
 * - Quando hospedar o Frontend separadamente (ex: GitHub Pages ou Vercel),
 *   substitua a string vazia abaixo pela URL pública do seu Backend no Render/Koyeb
 *   (ex: "https://meu-chatbot-ufms.onrender.com").
 * - Localmente, ele detecta automaticamente o servidor FastAPI na porta 8000.
 */
const CUSTOM_BACKEND_URL = "";

function getApiBaseUrl() {
  if (CUSTOM_BACKEND_URL.trim() !== "") {
    return CUSTOM_BACKEND_URL.replace(/\/+$/, "");
  }
  // Se estiver aberto via arquivo local (file://) ou Live Server (ex: porta 5500), aponta para a porta 8000
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

const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const clearChatBtn = document.getElementById("clear-chat-btn");
const topicsContainer = document.getElementById("topics-container");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const DEFAULT_WELCOME =
  "Olá! Sou o assistente virtual da Secretaria Acadêmica da UFMS. Digite sua dúvida sobre matrícula, histórico, trancamento, estágio, calendário acadêmico ou passe estudantil.";

/**
 * Escapa caracteres HTML para evitar injeção (XSS) e formata negrito (**texto**) e links clicáveis.
 */
function formatBotMessage(rawText) {
  const escaped = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Converte **texto** em <strong>texto</strong>
  const withBold = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Converte URLs (http/https) em links clicáveis
  return withBold.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function getCurrentTime() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Adiciona um balão de mensagem na tela do chat.
 */
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
  if (indicator) {
    indicator.remove();
  }
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Envia a dúvida do aluno para o Servidor Backend via Fetch API.
 */
async function sendMessage(messageText) {
  const trimmed = messageText.trim();
  if (!trimmed) return;

  appendMessage("user", trimmed);
  userInput.value = "";
  userInput.disabled = true;
  sendBtn.disabled = true;

  showTypingIndicator();

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: trimmed }),
    });

    removeTypingIndicator();

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();
    appendMessage("bot", data.response, {
      category: data.category,
      confidence: data.confidence,
    });
  } catch (error) {
    removeTypingIndicator();
    appendMessage(
      "bot",
      "⚠️ Não foi possível conectar ao servidor no momento. Verifique se o backend está em execução ou entre em contato com a Secretaria pelo telefone (67) 3345-7000.",
      { category: "Erro de Conexão" }
    );
    console.error("Erro ao consultar a API:", error);
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

/**
 * Inicializa o chat consultando as informações do servidor.
 */
async function initChat() {
  chatMessages.innerHTML = "";
  try {
    const response = await fetch(`${API_BASE_URL}/api/info`);
    if (response.ok) {
      const info = await response.json();
      statusDot.style.backgroundColor = "#22c55e";
      statusText.textContent = "Online • Secretaria Acadêmica";
      appendMessage("bot", info.welcome_message || DEFAULT_WELCOME, {
        category: "Boas-vindas",
      });
      return;
    }
  } catch (err) {
    statusDot.style.backgroundColor = "#f59e0b";
    statusText.textContent = "Modo Local • Verifique o Backend";
  }

  appendMessage("bot", DEFAULT_WELCOME, { category: "Boas-vindas" });
}

// Eventos de formulário e botões
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(userInput.value);
});

topicsContainer.addEventListener("click", (event) => {
  const chip = event.target.closest(".topic-chip");
  if (chip && chip.dataset.query) {
    sendMessage(chip.dataset.query);
  }
});

clearChatBtn.addEventListener("click", () => {
  initChat();
});

window.addEventListener("DOMContentLoaded", initChat);

