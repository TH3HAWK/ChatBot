import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.nlp_engine import NLPEngine


def run_tests():
    engine = NLPEngine()

    test_cases = [
        ("quero faser a matríclua!!!", "matricula_rematricula"),
        ("Como faço minha rematrícula no SISCAD?", "matricula_rematricula"),
        ("Preciso emitir meu histórico escolar", "historico_declaracao"),
        ("Quero trancar uma matéria esse semestre", "trancamento"),
        ("Onde assino o termo de estagio obrigatorio?", "estagio"),
        ("Como pedir aproveitamento de estudos?", "aproveitamento_disciplinas"),
        ("Quando começam as aulas no calendário acadêmico?", "calendario_academico"),
        ("Como renovar o passe estudantil?", "passe_estudantil_identidade"),
        ("Esqueci a senha do meu passaporte ufms", "passaporte_senha"),
        ("Qual o telefone da secretaria?", "contato_secretaria"),
        ("Qual a receita de bolo de cenoura?", "fallback"),
    ]

    for phrase, expected_intent in test_cases:
        result = engine.process_message(phrase)
        assert result["intent_id"] == expected_intent, (
            f"Falha para '{phrase}': esperado '{expected_intent}', "
            f"obtido '{result['intent_id']}' (score={result['confidence']})"
        )
        print(
            f"[OK] '{phrase}' -> {result['intent_id']} "
            f"(palavra: {result['matched_keyword']}, confiança: {result['confidence']})"
        )


if __name__ == "__main__":
    run_tests()
    print("\nTodos os testes do Motor NLP passaram com sucesso!")

