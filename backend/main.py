import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.nlp_engine import NLPEngine

app = FastAPI(
    title="API Chatbot Acadêmico UFMS",
    description="Servidor Backend (FastAPI) para processamento de dúvidas acadêmicas com Motor NLP independente.",
    version="1.0.0",
)

# Configuração de CORS para permitir que o Frontend hospedado no GitHub Pages / Vercel
# se comunique livremente com este Backend no Render / Koyeb.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

nlp_engine = NLPEngine()


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500, description="Mensagem enviada pelo aluno")


class ChatResponse(BaseModel):
    intent_id: str
    category: str
    response: str
    confidence: float
    matched_keyword: str | None = None
    normalized_input: str


@app.get("/api/health")
async def health_check():
    """Endpoint de verificação de status do servidor (útil para Render/Koyeb)."""
    return {"status": "online", "service": "Chatbot Acadêmico UFMS"}


@app.get("/api/info")
async def get_bot_info():
    """Retorna mensagem de boas-vindas e lista de tópicos da Base de Conhecimento."""
    return nlp_engine.get_public_metadata()


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest):
    """
    Recebe a dúvida do aluno vinda do Frontend, repassa ao Motor NLP
    e devolve a resposta estruturada.
    """
    user_text = payload.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="A mensagem não pode estar vazia.")

    result = nlp_engine.process_message(user_text)
    return result


# Servir o Frontend estático automaticamente caso acesse a raiz do servidor localmente
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
