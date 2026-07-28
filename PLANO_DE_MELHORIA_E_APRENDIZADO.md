# 📋 Plano de Aprendizado e Melhoria Contínua: CrazyDiagnostics

Este documento contém as **instruções técnicas de estudo e arquitetura** extraídas dos melhores projetos open-source de extensões e ferramentas de diagnóstico do GitHub para o **CrazyDiagnostics**.

---

## 🎯 Objetivo de Evolução
Transformar a extensão **CrazyDiagnostics** em uma ferramenta profissional de diagnósticos e inspeção de rede (nível Redux DevTools / Postman / Chrome DevTools).

---

## 📚 Projetos do GitHub para Estudo & Aprendizado

### 1. Chrome Extension Boilerplate Vite (`Jonghakseo/chrome-extension-boilerplate-react-vite`)
* **URL:** `https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite`
* **Conceitos a Aprender e Aplicar:**
  * **Manifest V3 Moderno:** Arquitetura baseada em Vite + React 19 + TypeScript.
  * **Hot Module Replacement (HMR):** Atualização instantânea da extensão durante o desenvolvimento sem precisar recarregar o navegador manualmente.

### 2. Interceptor / Surf CLI (`Hacker-Valley-Media/Interceptor`)
* **URL:** `https://github.com/Hacker-Valley-Media/Interceptor`
* **Conceitos a Aprender e Aplicar:**
  * **Chrome DevTools Protocol (CDP):** Captura de tráfego de rede em nível de sistema sem injetar scripts pesados nas páginas.
  * **Replay de Requisições:** Funcionalidade para re-executar uma requisição de API com falha direto pela extensão.

### 3. RxDB (`pubkey/rxdb`)
* **URL:** `https://github.com/pubkey/rxdb`
* **Conceitos a Aprender e Aplicar:**
  * **Armazenamento de Alta Performance:** Gravação local no `IndexedDB` para milhares de logs com busca rápida sem travar a memória RAM da aba.

---

## 🛠️ Roteiro de Implementação Passo a Passo

1. **Fase 1 - Modernização da Arquitetura:**
   * Organizar pastas entre `popup`, `content_scripts`, `background` (Service Worker) e `devtools`.
2. **Fase 2 - Captura & Replay:**
   * Adicionar filtro por status de erro (4xx / 5xx) e botão para re-testar requisições.
3. **Fase 3 - Painel DevTools & Exportação:**
   * Criar exportação de logs em JSON ou relatório formatado em 1 clique.
