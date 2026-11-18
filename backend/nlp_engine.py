import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class NLPEngine:
    """
    Motor Avançado de Processamento de Linguagem Natural.
    Arquitetura desenvolvida para alta tolerância a falhas ortográficas (Fuzzy Matching)
    e desambiguação de contexto baseada na densidade de tokens (Broad vs Specific Intents).
    """

    def __init__(self, kb_path: Optional[str] = None, fuzzy_threshold: float = 0.85):
        if kb_path is None:
            base_dir = Path(__file__).resolve().parent
            self.kb_path = base_dir / "knowledge_base.json"
        else:
            self.kb_path = Path(kb_path)

        self.fuzzy_threshold = fuzzy_threshold
        self._knowledge_base: Dict[str, Any] = {}
        self._load_knowledge_base()

    def _load_knowledge_base(self) -> None:
        """Carrega a base de dados mantendo isolamento I/O."""
        if not self.kb_path.exists():
            raise FileNotFoundError(f"[ERROR] Base de conhecimento ausente no path: {self.kb_path}")
            
        with open(self.kb_path, "r", encoding="utf-8") as f:
            self._knowledge_base = json.load(f)

    @staticmethod
    def normalize_text(text: str) -> str:
        """
        Sanitização profunda de input:
        - Decodificação ASCII (remoção de diacríticos/acentos).
        - Eliminação de pontuações não-alfanuméricas.
        - Redução de espaços em excesso.
        """
        if not text:
            return ""

        text = text.lower().strip()
        nfkd_form = unicodedata.normalize("NFKD", text)
        clean_accents = "".join(c for c in nfkd_form if not unicodedata.combining(c))
        clean_text = re.sub(r"[^a-z0-9\s]", " ", clean_accents)
        return re.sub(r"\s+", " ", clean_text).strip()

    @staticmethod
    def _calculate_similarity(a: str, b: str) -> float:
        """Cálculo de Distância / Similaridade via SequenceMatcher."""
        return SequenceMatcher(None, a, b).ratio()

    def _score_keyword(self, input_tokens: List[str], keyword: str, clean_input: str) -> float:
        """
        Mecanismo de Scoring:
        Calcula a precisão de um keyword contra a entrada do usuário.
        Atribui pesos substancialmente maiores para keywords longas (Intent Específica)
        em detrimento de keywords curtas (Intent Abrangente).
        """
        norm_kw = self.normalize_text(keyword)
        if not norm_kw:
            return 0.0

        kw_tokens = norm_kw.split()
        kw_length = len(kw_tokens)
        
        # Bônus estrutural: intenções longas e específicas valem mais se corresponderem.
        # Ex: "como fazer matricula" (3 tokens) vs "matricula" (1 token)
        weight_multiplier = 1.0 + (kw_length * 0.15) 

        # 1. Correspondência exata da string (Highest Priority)
        pattern = r"\b" + re.escape(norm_kw) + r"\b"
        if re.search(pattern, clean_input):
            return 1.0 * weight_multiplier

        # 2. Correspondência Aproximada (Fuzzy Matching para erros ortográficos)
        best_fuzzy_score = 0.0
        
        # Single-token fuzzy matching
        if kw_length == 1:
            if len(norm_kw) < 4:  # Previne falsos positivos em palavras curtas
                return 0.0
            for token in input_tokens:
                if len(token) >= 4:
                    sim = self._calculate_similarity(token, norm_kw)
                    if sim >= self.fuzzy_threshold and sim > best_fuzzy_score:
                        best_fuzzy_score = sim
            return best_fuzzy_score * weight_multiplier

        # Multi-token (n-gram) fuzzy matching
        if len(input_tokens) >= kw_length:
            n = kw_length
            for i in range(len(input_tokens) - n + 1):
                window = " ".join(input_tokens[i : i + n])
                sim = self._calculate_similarity(window, norm_kw)
                if sim >= (self.fuzzy_threshold - 0.05):  # Ligeira tolerância para blocos de texto
                    if sim > best_fuzzy_score:
                        best_fuzzy_score = sim
            return best_fuzzy_score * weight_multiplier

        return 0.0

    def process_message(self, user_message: str) -> Dict[str, Any]:
        """
        Orquestrador de Resposta. Analisa a entrada, aplica o Scoring Algorithm
        em todas as intenções e resolve o contexto vencedor.
        """
        clean_input = self.normalize_text(user_message)
        bot_info = self._knowledge_base.get("bot_info", {})
        fallback_msg = bot_info.get("fallback_message", "Erro de sistema. Contate a secretaria.")

        if not clean_input:
            return self._build_response_payload("fallback", "Atendimento Humano", fallback_msg, 0.0, None, "")

        input_tokens = clean_input.split()
        
        best_intent = None
        highest_score = 0.0
        matched_keyword = None

        # Varredura Completa na Base de Conhecimento
        for intent in self._knowledge_base.get("intents", []):
            for keyword in intent.get("keywords", []):
                score = self._score_keyword(input_tokens, keyword, clean_input)
                
                # Resolução de Desambiguação (Quem obteve a maior pontuação ponderada?)
                if score > highest_score:
                    highest_score = score
                    best_intent = intent
                    matched_keyword = keyword

        # Threshold base para validar se a IA realmente entendeu a requisição (0.8 mínimo ponderado)
        if best_intent and highest_score >= 0.8:
            return self._build_response_payload(
                intent_id=best_intent.get("id", "unk"),
                category=best_intent.get("category", "Geral"),
                response=best_intent.get("response", ""),
                confidence=round(min(highest_score, 1.0), 2),
                matched_kw=matched_keyword,
                norm_input=clean_input
            )

        # Fallback Trigger (Não atingiu confiança suficiente)
        return self._build_response_payload("fallback", "Encaminhamento", fallback_msg, 0.0, None, clean_input)

    def _build_response_payload(self, intent_id: str, category: str, response: str, 
                                confidence: float, matched_kw: Optional[str], norm_input: str) -> Dict[str, Any]:
        """Formata o Payload de saída seguindo os contratos do FastAPI."""
        return {
            "intent_id": intent_id,
            "category": category,
            "response": response,
            "confidence": confidence,
            "matched_keyword": matched_kw,
            "normalized_input": norm_input,
        }

    def get_public_metadata(self) -> Dict[str, Any]:
        """Exporta metadados essenciais para inicialização do frontend."""
        bot_info = self._knowledge_base.get("bot_info", {})
        return {
            "bot_name": bot_info.get("name", "Assistente Acadêmico UFMS"),
            "welcome_message": bot_info.get("welcome_message", "")
        }