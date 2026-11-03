# MVP Chatbot Acadêmico Independente — UFMS

Projeto de Chatbot de Atendimento para Secretaria Acadêmica da UFMS, desenvolvido com arquitetura desacoplada em 4 camadas para fácil manutenção por servidores técnico-administrativos e hospedagem 100% gratuita.

---

## Arquitetura do Sistema

```text
TCC/
├── backend/
│   ├── data/
│   │   └── knowledge_base.json   # 1. A Base de Dados (O Cérebro Flexível)
│   ├── nlp_engine.py             # 2. O Processador de Linguagem (Motor de NLP + Fuzzy Matching)
│   └── main.py                   # 3. O Servidor Backend (API Assíncrona com FastAPI)
├── frontend/
│   ├── index.html                # 4. O Frontend (Interface Web Responsiva)
│   ├── style.css
│   └── script.js
├── tests/
│   └── test_nlp.py               # Testes automatizados do Motor NLP
├── render.yaml                   # Configuração pronta para deploy gratuito no Render.com
└── requirements.txt              # Dependências enxutas do Python
```

### 1. A Base de Dados (`backend/data/knowledge_base.json`)
Armazena todas as intenções (`intents`), palavras-chave (`keywords`) e respostas (`response`), além da mensagem de fallback com o telefone/e-mail da secretaria.
- **Atualização em tempo real (Hot-Reload):** O Motor NLP verifica automaticamente se o arquivo `knowledge_base.json` foi salvo/modificado e recarrega as regras sem precisar reiniciar o servidor.

### 2. O Motor de NLP (`backend/nlp_engine.py`)
- Normaliza o texto (remove acentos, pontuações e converte para minúsculas).
- Combina **correspondência exata de termos** com **busca aproximada (Fuzzy Matching via `SequenceMatcher`)**, tolerando erros de digitação comuns (ex: `"quero faser a matríclua!!!"` identifica `"matricula"` com 89% de similaridade).

### 3. O Servidor Backend (`backend/main.py`)
- Desenvolvido em **FastAPI** para suportar múltiplos acessos simultâneos de forma assíncrona.
- Possui **CORS configurado** para permitir requisições vindas de qualquer domínio externo (GitHub Pages / Vercel) e também serve o próprio frontend localmente na rota raiz `/`.

### 4. O Frontend (`frontend/`)
- Desenvolvido em **HTML5, CSS3 e JavaScript puro (Vanilla JS)**, sem dependências pesadas.
- Layout responsivo para celulares e computadores, com botões de acesso rápido para as dúvidas mais frequentes da secretaria.

---

## Como Executar Localmente

1. **Instale as dependências:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Inicie o servidor FastAPI:**
   ```bash
   uvicorn backend.main:app --reload
   ```

3. **Acesse no navegador:**
   - **Interface do Chat:** http://127.0.0.1:8000
   - **Documentação Interativa da API (Swagger):** http://127.0.0.1:8000/docs

4. **Executar os testes do Motor NLP:**
   ```bash
   python tests/test_nlp.py
   ```

---

## Plano de Hospedagem Gratuita (Custo Zero)

1. **Backend (Render.com ou Koyeb):**
   - Suba este repositório no GitHub.
   - No **Render.com**, clique em **New > Web Service** e conecte seu repositório.
   - Comando de Build: `pip install -r requirements.txt`
   - Comando de Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - *(Dica: como o backend já serve a pasta `frontend/` na rota `/`, o link gerado pelo Render já abre o chat completo!)*

2. **Frontend Separado (Opcional — GitHub Pages ou Vercel):**
   - Caso queira hospedar a pasta `frontend/` separadamente no GitHub Pages ou Vercel, basta editar a constante `CUSTOM_BACKEND_URL` na linha 8 do arquivo `frontend/script.js` com a URL gerada pelo Render.

