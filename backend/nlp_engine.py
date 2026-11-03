import json
import os
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional


class NLPEngine:
    """
    Motor de Processamento de Linguagem Natural (NLP) para o Chatbot Acadêmico.
    Realiza limpeza de texto, remoção de acentos/pontuação, correspondência exata
    e busca aproximada (fuzzy matching) para tolerar erros de digitação.
    """

    def __init__(self, kb_path: Optional[str] = None, fuzzy_threshold: float = 0.78):
        if kb_path is None:
            base_dir = Path(__file__).resolve().parent
            self.kb_path = base_dir / "data" / "knowledge_base.json"
        else:
            self.kb_path = Path(kb_path)

        self.fuzzy_threshold = fuzzy_threshold
        self._last_mtime: float = 0.0
        self.knowledge_base: Dict[str, Any] = {}
        self._load_knowledge_base()

    def _load_knowledge_base(self) -> None:
        """
        Carrega (ou recarrega automaticamente se modificado) o arquivo JSON da base de conhecimento.
        Isso permite que a secretaria edite o JSON sem precisar reiniciar o servidor.
        """
        if not self.kb_path.exists():
            raise FileNotFoundError(f"Base de conhecimento não encontrada em: {self.kb_path}")

        current_mtime = os.path.getmtime(self.kb_path)
        if current_mtime != self._last_mtime or not self.knowledge_base:
            with open(self.kb_path, "r", encoding="utf-8") as f:
                self.knowledge_base = json.load(f)
            self._last_mtime = current_mtime

    @staticmethod
    def normalize_text(text: str) -> str:
        """
        Limpa o texto cru do aluno:
        1. Converte para letras minúsculas
        2. Remove acentuação (ex: 'matrícula' -> 'matricula')
        3. Remove pontuações e caracteres especiais (ex: '!!!' -> '')
        4. Remove espaços duplicados
        """
        if not text:
            return ""

        text = text.lower().strip()
        nfkd_form = unicodedata.normalize("NFKD", text)
        without_accents = "".join(c for c in nfkd_form if not unicodedata.combining(c))
        clean_text = re.sub(r"[^a-z0-9\s]", " ", without_accents)
        return re.sub(r"\s+", " ", clean_text).strip()

    @staticmethod
    def _similarity(a: str, b: str) -> float:
        """Calcula a similaridade entre duas strings (0.0 a 1.0)."""
        return SequenceMatcher(None, a, b).ratio()

    def _score_intent(self, clean_input: str, input_tokens: List[str], keywords: List[str]) -> Dict[str, Any]:
        """
        Calcula a pontuação de compatibilidade entre a mensagem do aluno e as palavras-chave de uma intenção.
        Combina busca exata de expressões/palavras com busca aproximada (fuzzy matching).
        """
        best_score = 0.0
        matched_keyword = None

        for raw_kw in keywords:
            norm_kw = self.normalize_text(raw_kw)
            if not norm_kw:
                continue

            kw_tokens = norm_kw.split()

            # 1. Correspondência exata de expressão ou palavra inteira no texto
            pattern = r"\b" + re.escape(norm_kw) + r"\b"
            if re.search(pattern, clean_input):
                # Expressões com mais palavras têm leve prioridade sobre palavras isoladas
                score = 1.0 + min(len(kw_tokens) * 0.05, 0.20)
                if score > best_score:
                    best_score = score
                    matched_keyword = raw_kw
                continue

            # 2. Busca aproximada (Fuzzy Matching) para tolerar erros de digitação (ex: "matríclua" -> "matricula")
            if len(kw_tokens) == 1:
                for token in input_tokens:
                    # Evita comparar palavras muito curtas por fuzzy para não gerar falsos positivos
                    if len(token) < 4 or len(norm_kw) < 4:
                        continue
                    sim = self._similarity(token, norm_kw)
                    if sim >= self.fuzzy_threshold and sim > best_score:
                        best_score = sim
                        matched_keyword = raw_kw
            else:
                # Para palavras-chave compostas (ex: "historico escolar"), compara com janelas do texto (n-grams)
                n = len(kw_tokens)
                if len(input_tokens) >= n:
                    for i in range(len(input_tokens) - n + 1):
                        window = " ".join(input_tokens[i : i + n])
                        sim = self._similarity(window, norm_kw)
                        if sim >= self.fuzzy_threshold and (sim + 0.05) > best_score:
                            best_score = sim + 0.05
                            matched_keyword = raw_kw

        return {"score": best_score, "matched_keyword": matched_keyword}

    def process_message(self, user_message: str) -> Dict[str, Any]:
        """
        Recebe a frase crua do aluno, limpa o texto, compara com a Base de Dados
        e retorna a resposta correspondente ou a mensagem de fallback.
        """
        self._load_knowledge_base()

        clean_input = self.normalize_text(user_message)
        bot_info = self.knowledge_base.get("bot_info", {})
        fallback_msg = bot_info.get(
            "fallback_message",
            "Não entendi sua dúvida. Entre em contato com a Secretaria pelo telefone (67) 3345-7000.",
        )

        if not clean_input:
            return {
                "intent_id": "fallback",
                "category": "Não identificado",
                "response": fallback_msg,
                "confidence": 0.0,
                "matched_keyword": None,
                "normalized_input": "",
            }

        input_tokens = clean_input.split()
        best_intent = None
        highest_score = 0.0
        best_keyword = None

        for intent in self.knowledge_base.get("intents", []):
            keywords = intent.get("keywords", [])
            result = self._score_intent(clean_input, input_tokens, keywords)

            if result["score"] > highest_score:
                highest_score = result["score"]
                best_intent = intent
                best_keyword = result["matched_keyword"]

        if best_intent and highest_score >= self.fuzzy_threshold:
            return {
                "intent_id": best_intent.get("id"),
                "category": best_intent.get("category", "Geral"),
                "response": best_intent.get("response"),
                "confidence": round(min(highest_score, 1.0), 2),
                "matched_keyword": best_keyword,
                "normalized_input": clean_input,
            }

        return {
            "intent_id": "fallback",
            "category": "Atendimento Humano / Fallback",
            "response": fallback_msg,
            "confidence": 0.0,
            "matched_keyword": None,
            "normalized_input": clean_input,
        }

    def get_public_metadata(self) -> Dict[str, Any]:
        """Retorna informações públicas do bot e categorias disponíveis para sugerir na interface."""
        self._load_knowledge_base()
        bot_info = self.knowledge_base.get("bot_info", {})
        categories = [
            {
                "id": intent.get("id"),
                "category": intent.get("category"),
                "sample_keyword": intent.get("keywords", [""])[0],
            }
            for intent in self.knowledge_base.get("intents", [])
            if intent.get("id") not in ("saudacao", "agradecimento")
        ]
        return {
            "bot_name": bot_info.get("name", "Assistente Acadêmico UFMS"),
            "welcome_message": bot_info.get("welcome_message", "Olá! Como posso ajudar?"),
            "topics": categories,
        }

