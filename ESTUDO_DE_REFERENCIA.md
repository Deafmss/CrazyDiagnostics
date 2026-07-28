# 📚 Guia de Estudo e Referências de Arquitetura: CrazyDiagnostics

Este documento mapeia os melhores projetos open-source de extensões de Chrome, DevTools e captura de diagnósticos do GitHub para servirem de referência para o **CrazyDiagnostics**.

---

## 🏛️ Projetos de Referência do GitHub

### 1. API Mapper (`mikkelkrogsholm/api-mapper`)
* **Repositório:** [https://github.com/mikkelkrogsholm/api-mapper](https://github.com/mikkelkrogsholm/api-mapper)
* **Tecnologias:** Chrome Extension Manifest V3, DevTools Protocol, JavaScript.
* **O que estudar a fundo:**
  * **Mapeamento de Rotas:** Como interceptar rotas de API em tempo real e exibir a estrutura no painel lateral do Chrome DevTools.
  * **Filtros por Tipo de Resposta:** Separação automática entre payloads JSON, falhas 4xx/5xx e requisições lentas.

### 2. Neo Extension (`4ier/neo`)
* **Repositório:** [https://github.com/4ier/neo](https://github.com/4ier/neo)
* **Tecnologias:** JavaScript, Web Request Interceptor, Content Scripts.
* **O que estudar a fundo:**
  * **Interceptação Transparente:** Como capturar requisições assíncronas (`fetch` e `XMLHttpRequest`) sem afetar o desempenho da aba do usuário.
  * **Overlay e UI Flutuante:** Padrões para exibir contadores de erro e badges discretos sobre a página em execução.

---

## 💡 Pontos de Melhoria Diretos para o CrazyDiagnostics

1. **Painel Integrado ao DevTools:**
   * Criar uma aba dedicada no Chrome DevTools para facilitar o trabalho de desenvolvedores e analistas.
2. **Replay de Requisições:**
   * Permitir que o usuário re-execute um log ou requisição com falha direto pela extensão para testar o comportamento da API.
3. **Exportação de Logs:**
   * Permitir exportar os diagnósticos capturados em formato JSON formatado ou relatório pronto em 1 clique.
