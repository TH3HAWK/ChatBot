import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Resolução de Paths de Sistema (Garante que a importação do NLP não falhe)
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Importando o novo motor estruturado
from backend.nlp_engine import NLPEngine

app = FastAPI(
    title="API Chatbot Acadêmico UFMS",
    description="Backend FastAPI com Processamento de Contexto Avançado e Desambiguação.",
    version="2.0.0",
)

# Conformidade de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Inicialização isolada do Singleton Engine
nlp_engine = NLPEngine()

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500, description="Payload de texto do usuário")

class ChatResponse(BaseModel):
    intent_id: str
    category: str
    response: str
    confidence: float
    matched_keyword: str | None = None
    normalized_input: str

@app.get("/api/health")
async def health_check():
    """Monitoramento de integridade do Cluster."""
    return {"status": "operational", "service": "Core NLP UFMS"}

@app.get("/api/info")
async def get_bot_info():
    """Resgate seguro de metadados da aplicação."""
    return nlp_engine.get_public_metadata()

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest):
    """
    Gateway de Conversação:
    Recebe strings textuais e delega o processamento lógico ao NLPEngine.
    """
    user_text = payload.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Null payload rejected.")

    result = nlp_engine.process_message(user_text)
    return result

if __name__ == "__main__":
    import uvicorn
    # Execução standalone (não recomendado para produção - use gunicorn+uvicorn workers)
    uvicorn.run(app, host="127.0.0.1", port=8000)