document.addEventListener('DOMContentLoaded', async () => {
  let activeTabId = null;
  let currentTabUrl = '';
  let allLogs = [];
  let currentFilter = 'all';
  let contextMode = 'page'; // 'all' or 'page'

  // Load dynamic rules at startup to merge with translator
  chrome.storage.local.get(['dynamic_rules'], function(result) {
    if (result.dynamic_rules && typeof CrazyTranslator !== 'undefined') {
      CrazyTranslator.loadDynamicRules(result.dynamic_rules);
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const isFloating = urlParams.get('floating') === 'true';
  const detachedTabId = urlParams.get('tabId');

  const emptyState = document.getElementById('empty-state');
  const logsList = document.getElementById('logs-list');
  const btnClear = document.getElementById('btn-clear');
  const btnExport = document.getElementById('btn-export');
  const btnDetach = document.getElementById('btn-detach');
  const btnRefresh = document.getElementById('btn-refresh');
  const filtersContainer = document.querySelector('.filters-container');
  const searchInput = document.getElementById('search-input');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderLogs();
    });
  }

  if (isFloating) {
    document.documentElement.classList.add('floating-window');
    if (btnDetach) btnDetach.classList.add('hidden');
  }

  const connectionsWidget = document.getElementById('connections-widget');
  const connectionsToggle = document.getElementById('connections-toggle');
  const connectionsListContainer = document.getElementById('connections-list-container');
  const activeConnectionsCount = document.getElementById('active-connections-count');

  if (connectionsToggle && connectionsWidget) {
    connectionsToggle.addEventListener('click', () => {
      connectionsWidget.classList.toggle('collapsed');
    });
  }

  const contextToggle = document.getElementById('context-toggle');
  const contextAreaName = document.getElementById('context-area-name');
  if (contextToggle) {
    contextToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.context-toggle-btn');
      if (btn) {
        contextMode = btn.getAttribute('data-mode');
        contextToggle.querySelectorAll('.context-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateBadgesCount();
        renderLogs();
      }
    });
  }

  // Badge DOM elements
  const badges = {
    all: document.getElementById('badge-all'),
    meta: document.getElementById('badge-meta'),
    unofficial: document.getElementById('badge-unofficial'),
    universal: document.getElementById('badge-universal'),
    database: document.getElementById('badge-database'),
    system: document.getElementById('badge-system')
  };

  // 1. Click-and-Drag Horizontal Scroll for Filters Menu
  let isDown = false;
  let startX;
  let scrollLeft;
  let moved = false;

  filtersContainer.addEventListener('mousedown', (e) => {
    isDown = true;
    moved = false;
    const rect = filtersContainer.getBoundingClientRect();
    startX = e.pageX - (rect.left + window.scrollX);
    scrollLeft = filtersContainer.scrollLeft;
  });

  filtersContainer.addEventListener('mouseleave', () => {
    isDown = false;
  });

  filtersContainer.addEventListener('mouseup', () => {
    isDown = false;
  });

  filtersContainer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const rect = filtersContainer.getBoundingClientRect();
    const x = e.pageX - (rect.left + window.scrollX);
    const walk = (x - startX) * 1.6; // Scroll speed multiplier
    if (Math.abs(walk) > 3) {
      moved = true;
    }
    filtersContainer.scrollLeft = scrollLeft - walk;
  });

  // Helper to extract the primary route segment (SPA path, Hash path, or Query params)
  function getRouteSegment(urlObj) {
    if (!urlObj) return '';
    
    // 1. Check pathname segment first
    const path = urlObj.pathname;
    if (path && path !== '/') {
      const cleanPath = path.replace(/^\//, '').split('?')[0];
      const segment = cleanPath.split('/')[0];
      // Ignore entry file names like index.html
      if (segment && !segment.endsWith('.html') && !segment.endsWith('.php')) {
        return segment.toLowerCase();
      }
    }
    
    // 2. Fallback check common query parameters (e.g. ?page=leads)
    const searchParams = urlObj.searchParams;
    const queryKeys = ['page', 'view', 'tab', 'route', 'p', 'sec', 'section'];
    for (const key of queryKeys) {
      const val = searchParams.get(key);
      if (val) {
        return val.split('/')[0].toLowerCase();
      }
    }
    
    // 3. Fallback check hash route
    const hash = urlObj.hash;
    if (hash) {
      const cleanHash = hash.replace(/^#\/?/, '').split('?')[0];
      const segment = cleanHash.split('/')[0];
      if (segment) return segment.toLowerCase();
    }
    
    return '';
  }

  // Helper: map URL to CRM Area segment
  function getCurrentPageArea(urlStr) {
    if (!urlStr) return 'general';
    try {
      const urlObj = new URL(urlStr, window.location.origin);
      const segment = getRouteSegment(urlObj);
      return segment || 'general';
    } catch (e) {
      return 'general';
    }
  }

  // Helper: extract CRM Area segment that the error logically belongs to based on context or content
  function getErrorArea(log) {
    if (!log) return 'general';

    // 1. Check if it is explicitly related to automations
    const logCtx = log.data?.context || {};
    if (logCtx.blockId || logCtx.automationName) {
      return 'automation';
    }

    // 2. Check if it is explicitly related to leads/deals/kanban
    if (logCtx.leadId || logCtx.dealId || logCtx.pipelineId || logCtx.cardName) {
      return 'leads';
    }

    // 3. Check if it's a live chat or connection error
    const translated = CrazyTranslator.translate(log);
    const categoryClass = translated?.categoryClass || '';
    const gatewayName = translated?.gatewayName || '';
    const title = (translated?.title || '').toLowerCase();
    const errMsg = (log.data?.errorDetail?.errorMessage || '').toLowerCase();
    const msg = (log.data?.message || '').toLowerCase();

    const isChatOrConn = 
      categoryClass === 'tag-meta' || 
      categoryClass === 'tag-unofficial' || 
      categoryClass === 'tag-universal' ||
      gatewayName ||
      title.includes('conversa') || title.includes('mensagem') || title.includes('whatsapp') || title.includes('instância') || title.includes('conexão') || title.includes('websocket') ||
      errMsg.includes('chat') || errMsg.includes('message') || errMsg.includes('whatsapp') || errMsg.includes('websocket') ||
      msg.includes('chat') || msg.includes('message') || msg.includes('whatsapp') || msg.includes('websocket') || msg.includes('conexão de mensagens');

    if (isChatOrConn) {
      return 'chat';
    }

    // 4. Fallback: check errorPageUrl segment
    const errorPageUrl = log.data?.pageUrl;
    if (errorPageUrl) {
      try {
        const urlObj = new URL(errorPageUrl, window.location.origin);
        const segment = getRouteSegment(urlObj);
        if (segment) return segment;
      } catch (e) {}
    }

    return 'general';
  }

  // Helper: check if error happened in the same area/module of the CRM or logically belongs to it
  function isSameArea(errorPageUrl, currentTabUrl, log) {
    if (!currentTabUrl) return true;
    try {
      const pageArea = getCurrentPageArea(currentTabUrl);
      const errorArea = getErrorArea(log);

      // If the error area is general, fallback to segment mapping or show everywhere if general system error
      if (errorArea === 'general') {
        if (!errorPageUrl) return true;
        const errPageArea = getCurrentPageArea(errorPageUrl);
        if (errPageArea === 'general') return true;
        return errPageArea === pageArea;
      }

      // Strict area mapping
      if (errorArea === 'chat') {
        return pageArea === 'chat' || pageArea === 'chats' || pageArea === 'conexoes' || pageArea === 'connections' || pageArea === 'whatsapp' || pageArea === 'canais' || pageArea === 'multiservice' || pageArea === 'atendimento' || pageArea === 'atendimentos';
      }

      if (errorArea === 'automation') {
        return pageArea === 'automation' || pageArea === 'automations' || pageArea === 'automacao' || pageArea === 'automacoes' || pageArea === 'fluxo' || pageArea === 'fluxos' || pageArea === 'flow' || pageArea === 'flows';
      }

      if (errorArea === 'leads') {
        return pageArea === 'leads' || pageArea === 'lead' || pageArea === 'kanban' || pageArea === 'quadro' || pageArea === 'board' || pageArea === 'boards';
      }

      return errorArea === pageArea;
    } catch (e) {
      return true;
    }
  }

  // Helper: map URL to friendly Portuguese name representing CRM Area
  function getFriendlyAreaName(urlStr) {
    if (!urlStr) return '📍 Geral';
    try {
      const urlObj = new URL(urlStr, window.location.origin);
      const segment = getRouteSegment(urlObj).toLowerCase();
      
      if (!segment) {
        if (urlObj.pathname.includes('simulator.html')) return '📍 Simulador';
        return '📍 Geral';
      }
      
      switch (segment) {
        case 'leads':
        case 'lead':
        case 'kanban':
        case 'quadro':
        case 'board':
        case 'boards':
          return '📍 Leads / Kanban';
        case 'automation':
        case 'automations':
        case 'automacao':
        case 'automacoes':
        case 'fluxo':
        case 'fluxos':
        case 'flow':
        case 'flows':
          return '📍 Automações';
        case 'chat':
        case 'chats':
        case 'conversa':
        case 'conversas':
        case 'atendimento':
          return '📍 Chat ao Vivo';
        case 'connections':
        case 'conexoes':
        case 'whatsapp':
        case 'gateways':
        case 'channel':
        case 'canais':
          return '📍 Conexões';
        case 'config':
        case 'configuracao':
        case 'configuracoes':
        case 'settings':
        case 'ajustes':
          return '📍 Configurações';
        case 'dashboard':
        case 'relatorios':
        case 'relatorio':
        case 'analytics':
          return '📍 Dashboard';
        case 'simulator':
        case 'simulator.html':
          return '📍 Simulador';
        default:
          return `📍 ${segment.charAt(0).toUpperCase() + segment.slice(1)}`;
      }
    } catch (e) {
      return '📍 Geral';
    }
  }

  // 2. Get the current active tab details or use detached values
  async function initTabContext() {
    const isDevTools = typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.inspectedWindow;
    if (isDevTools) {
      activeTabId = chrome.devtools.inspectedWindow.tabId;
      return new Promise((resolve) => {
        chrome.devtools.inspectedWindow.eval("window.location.href", (result, isException) => {
          if (!isException && result) {
            currentTabUrl = result;
          } else {
            currentTabUrl = '';
          }
          resolve();
        });
      });
    } else if (detachedTabId) {
      activeTabId = parseInt(detachedTabId, 10);
      try {
        const tab = await chrome.tabs.get(activeTabId);
        currentTabUrl = tab.url || '';
      } catch (err) {
        console.warn('CrazyDiagnostics: Erro ao recuperar dados da aba destacada:', err);
      }
    } else {
      try {
        let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        }
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ active: true });
        }
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ url: [ "*://*.datacrazy.io/*", "http://localhost/*", "http://127.0.0.1/*" ] });
        }
        
        if (tabs && tabs[0]) {
          activeTabId = tabs[0].id;
          currentTabUrl = tabs[0].url || '';
        }
      } catch (err) {
        console.error('CrazyDiagnostics: Erro ao recuperar aba ativa:', err);
      }
    }
  }

  await initTabContext();

  // Listen for tab URL updates (so when the user navigates inside the CRM, the logs update dynamically)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId === activeTabId && changeInfo.url) {
      currentTabUrl = changeInfo.url;
      loadLogs();
    }
  });

  // Listen for navigation inside inspected DevTools window
  if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.network) {
    chrome.devtools.network.onNavigated.addListener((url) => {
      currentTabUrl = url;
      loadLogs();
    });
  }

  // Listen for tab changes (only if we're in the default popup, not detached panel)
  if (!detachedTabId) {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      activeTabId = activeInfo.tabId;
      try {
        const tab = await chrome.tabs.get(activeTabId);
        currentTabUrl = tab.url || '';
        loadLogs();
      } catch (err) {
        console.warn('CrazyDiagnostics: Erro ao mudar de aba ativa:', err);
      }
    });
  }

  let currentActiveContext = null;

  function isSupportedUrl(urlStr) {
    if (!urlStr) return false;
    try {
      const url = new URL(urlStr);
      return (
        url.hostname.endsWith('datacrazy.io') ||
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.pathname.includes('simulator.html')
      );
    } catch (e) {
      return false;
    }
  }

  function setFooterStatus(color, text) {
    const dot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    if (dot) {
      dot.className = 'status-dot ' + color;
    }
    if (statusText) {
      statusText.textContent = text;
    }
  }

  function updateEmptyState(type) {
    if (!emptyState) return;
    const radar = emptyState.querySelector('.radar-scan');
    const title = emptyState.querySelector('h3');
    const desc = emptyState.querySelector('p');
    
    if (type === 'unsupported') {
      if (radar) radar.classList.add('hidden');
      if (title) title.innerHTML = 'Extensão Inativa nesta Página';
      if (desc) desc.innerHTML = 'Abra a aba do <strong>CRM DataCrazy</strong> para começar a diagnosticar e monitorar os erros em tempo real.';
    } else if (type === 'filtered') {
      if (radar) radar.classList.remove('hidden');
      if (title) title.innerHTML = 'Nenhum erro encontrado para este filtro';
      if (desc) desc.innerHTML = 'Tente limpar os filtros ou a busca para ver todos os erros.';
    } else {
      if (radar) radar.classList.remove('hidden');
      if (title) title.innerHTML = 'Nenhum erro registrado';
      if (desc) desc.innerHTML = 'Aguardando tráfego do DataCrazy CRM. Todos os fluxos, APIs e conexões de rede estão rodando normalmente.';
    }
  }

  // 3. Fetch and render logs
  async function loadLogs() {
    if (!activeTabId) return;

    if (!isSupportedUrl(currentTabUrl)) {
      if (connectionsWidget) connectionsWidget.classList.add('hidden');
      if (filtersContainer) filtersContainer.classList.add('hidden');
      if (logsList) logsList.classList.add('hidden');
      if (emptyState) {
        emptyState.classList.remove('hidden');
        updateEmptyState('unsupported');
      }
      setFooterStatus('gray', 'Página não monitorada');
      return;
    }

    if (connectionsWidget) connectionsWidget.classList.remove('hidden');
    if (filtersContainer) filtersContainer.classList.remove('hidden');
    updateEmptyState('normal');

    // Update context area label
    if (contextAreaName) {
      const areaName = getFriendlyAreaName(currentTabUrl);
      contextAreaName.textContent = areaName.replace('📍 ', '');
    }

    // A. Query the current page context of the active tab (to know if a specific lead is selected right now)
    chrome.tabs.sendMessage(activeTabId, { action: 'GET_CURRENT_CONTEXT' }, (contextResponse) => {
      if (chrome.runtime.lastError) {
        currentActiveContext = null;
      } else {
        currentActiveContext = contextResponse?.context || null;
      }

      // B. Fetch logs from background script
      chrome.runtime.sendMessage({ action: 'GET_ERRORS', tabId: activeTabId }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('CrazyDiagnostics: Erro ao chamar background worker:', chrome.runtime.lastError);
          setFooterStatus('red', 'Extensão não conectada à aba');
          return;
        }

        setFooterStatus('green', 'Escutando tráfego do DataCrazy...');
        allLogs = response?.errors || [];
        updateBadgesCount();
        renderLogs();
        loadConnections(); // Carrega status das conexões
      });

      chrome.runtime.sendMessage({ action: 'GET_HEALTH_SCORE', tabId: activeTabId }, (response) => {
        if (response && response.health) {
          renderHealthScoreUI(response.health);
        }
      });
    });
  }

  async function loadConnections() {
    if (!activeTabId) return;

    chrome.runtime.sendMessage({ action: 'GET_CONNECTIONS', tabId: activeTabId }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('CrazyDiagnostics: Erro ao carregar conexões:', chrome.runtime.lastError);
        return;
      }

      const conns = response?.connections || [];
      updateConnectionsUI(conns);
    });
  }

  function matchesActiveCompanyForConnection(conn) {
    if (!currentActiveContext) return true;

    const activeCompanyId = (currentActiveContext.companyId || '').trim();
    const activeCompanyName = (currentActiveContext.companyName || '').trim().toLowerCase();
    const activeCompanyTaxId = (currentActiveContext.companyTaxId || '').trim();

    const activeHasCompany = activeCompanyId || activeCompanyName || activeCompanyTaxId;

    if (activeHasCompany) {
      const connCompanyId = (conn.companyId || '').trim();
      const connCompanyName = (conn.companyName || '').trim().toLowerCase();
      const connCompanyTaxId = (conn.companyTaxId || '').trim();

      const connHasCompany = connCompanyId || connCompanyName || connCompanyTaxId;
      if (!connHasCompany) {
        return true; // Keep connection if it doesn't have any company info, since the tab connections are already cleared on company switch
      }

      if (activeCompanyId && connCompanyId && activeCompanyId === connCompanyId) {
        return true;
      }
      if (activeCompanyTaxId && connCompanyTaxId && activeCompanyTaxId === connCompanyTaxId) {
        return true;
      }
      if (activeCompanyName && connCompanyName) {
        const cleanActive = activeCompanyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const cleanConn = connCompanyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (cleanActive.includes(cleanConn) || cleanConn.includes(cleanActive)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  function updateConnectionsUI(conns) {
    if (!connectionsListContainer) return;

    const filteredConns = conns.filter(c => matchesActiveCompanyForConnection(c));

    if (activeConnectionsCount) {
      activeConnectionsCount.textContent = filteredConns.length;
    }

    if (filteredConns.length === 0) {
      connectionsListContainer.innerHTML = `
        <div class="empty-connections">
          Nenhuma conexão ativa detectada nesta aba.
        </div>
      `;
      return;
    }

    connectionsListContainer.innerHTML = '';

    const friendlyProviders = {
      meta_manual: 'Meta (Conexão Manual)',
      meta_default: 'Meta (Padrão)',
      meta_coexistence: 'Meta (Coexistência)',
      whatsapp_official: 'WhatsApp Oficial (Meta)',
      whatsapp_unofficial: 'WhatsApp (API Não Oficial)',
      evolution: 'Evolution API',
      zapi: 'Z-API',
      dapi: 'D-API',
      uazapi: 'Uazapi',
      universal: 'Conexão Universal',
      instagram: 'Instagram API',
      messenger: 'Messenger API',
      facebook: 'Facebook Messenger'
    };

    filteredConns.forEach(c => {
      const item = document.createElement('div');
      item.className = 'connection-item';

      const providerLabel = friendlyProviders[c.provider] || c.type || 'Conexão';
      
      let statusClass = 'yellow';
      let friendlyStatus = 'Pendente';
      
      const connStatus = String(c.status).toUpperCase();
      if (['CONNECTED', 'ACTIVE', 'ONLINE', 'SUCCESS', 'PAIRED', 'ATIVO', 'CONECTADO'].includes(connStatus)) {
        statusClass = 'green';
        friendlyStatus = 'Ativo';
      } else if (['DISCONNECTED', 'OFFLINE', 'FAILED', 'UNPAIRED', 'INATIVO', 'DESCONECTADO'].includes(connStatus)) {
        statusClass = 'red';
        friendlyStatus = 'Inativo';
      } else {
        friendlyStatus = c.status || 'Desconhecido';
      }

      const metadata = c.name && c.name !== 'Conexão Ativa' ? `<span style="color: var(--text-muted); font-size: 8.5px; margin-left: 5px;">(${c.name})</span>` : '';

      item.innerHTML = `
        <div class="connection-info">
          <span style="font-weight: 500;">${escapeHtml(providerLabel)}</span>
          ${metadata}
        </div>
        <div class="connection-status-tag">
          <span class="status-dot-mini ${statusClass}"></span>
          <span style="color: var(--text-secondary);">${escapeHtml(friendlyStatus)}</span>
        </div>
      `;
      
      connectionsListContainer.appendChild(item);
    });
  }

  // Helper to check if a log matches the active company context
  function matchesActiveCompany(log) {
    if (!currentActiveContext) return true; // Show everything if no active context is selected

    const activeCompanyId = (currentActiveContext.companyId || '').trim();
    const activeCompanyName = (currentActiveContext.companyName || '').trim().toLowerCase();
    const activeCompanyTaxId = (currentActiveContext.companyTaxId || '').trim();

    const activeHasCompany = activeCompanyId || activeCompanyName || activeCompanyTaxId;

    if (activeHasCompany) {
      const logCtx = log.data?.context || {};
      const logCompanyId = (logCtx.companyId || '').trim();
      const logCompanyName = (logCtx.companyName || '').trim().toLowerCase();
      const logCompanyTaxId = (logCtx.companyTaxId || '').trim();

      const logHasCompany = logCompanyId || logCompanyName || logCompanyTaxId;
      if (!logHasCompany) {
        return true; // Keep log if it doesn't have any company info, since the tab logs are already cleared on company switch
      }

      if (activeCompanyId && logCompanyId && activeCompanyId === logCompanyId) {
        return true;
      }
      if (activeCompanyTaxId && logCompanyTaxId && activeCompanyTaxId === logCompanyTaxId) {
        return true;
      }
      if (activeCompanyName && logCompanyName) {
        const cleanActive = activeCompanyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const cleanLog = logCompanyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (cleanActive.includes(cleanLog) || cleanLog.includes(cleanActive)) {
          return true;
        }
      }
      
      // Strict company filtering: if screen is focused on a company, hide logs of other companies
      return false;
    }

    return true; // Keep log if no company is active on screen
  }

  // Helper to check if a log matches the active selected lead/chat context
  function matchesActiveLead(log) {
    if (!currentActiveContext) return true; // Show everything if no active lead context is selected

    const activeName = (currentActiveContext.leadName || '').trim().toLowerCase();
    const activePhone = (currentActiveContext.leadPhone || '').trim();
    const activeId = (currentActiveContext.leadId || '').trim();

    const logCtx = log.data?.context || {};
    const logName = (logCtx.leadName || '').trim().toLowerCase();
    const logPhone = (logCtx.leadPhone || '').trim();
    const logId = (logCtx.leadId || '').trim();

    const activeHasLead = activeName || activePhone || activeId;

    if (activeHasLead) {
      const logHasLead = logId || logPhone || logName;
      if (!logHasLead) {
        return true; // Keep log if it doesn't have any lead details (e.g. system, console, database, or WebSocket errors)
      }

      if (activeId && logId && activeId === logId) {
        return true;
      }
      if (activePhone && logPhone && activePhone === logPhone) {
        return true;
      }
      if (activeName && logName) {
        const cleanActiveName = activeName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const cleanLogName = logName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (cleanActiveName.includes(cleanLogName) || cleanLogName.includes(cleanActiveName)) {
          return true;
        }
      }
      return false; // Mismatch or no lead details on the log while looking at a lead
    }

    return true; // Keep log if no lead is currently active on screen
  }

  // Helper to check if a log matches the active selected connection/integration context
  function matchesActiveConnection(log) {
    if (!currentActiveContext) return true;

    const activeConnName = (currentActiveContext.connectionName || '').trim().toLowerCase();
    const activeConnProvider = (currentActiveContext.connectionProvider || '').trim().toLowerCase();

    // If there is no active connection context selected on the screen, show everything
    if (!activeConnName && !activeConnProvider) return true;

    const logCtx = log.data?.context || {};
    const logConnName = (logCtx.connectionName || '').trim().toLowerCase();
    const logConnProvider = (logCtx.connectionProvider || '').trim().toLowerCase();

    const translated = CrazyTranslator.translate(log);
    const logGateway = (translated?.gatewayName || '').trim().toLowerCase();

    // If the log is explicitly associated with a connection
    const logHasConnection = logConnName || logConnProvider || logGateway;

    if (logHasConnection) {
      if (activeConnName) {
        if (logConnName && (activeConnName.includes(logConnName) || logConnName.includes(activeConnName))) return true;
        if (logGateway && (activeConnName.includes(logGateway) || logGateway.includes(activeConnName))) return true;
      }
      if (activeConnProvider) {
        if (logConnProvider && (activeConnProvider.includes(logConnProvider) || logConnProvider.includes(activeConnProvider))) return true;
        if (logGateway && (activeConnProvider.includes(logGateway) || logGateway.includes(activeConnProvider))) return true;
      }
      return false; // Connection mismatch
    }

    return true; // Keep generic system/network errors
  }

  // Helper to check if a log matches the specific clicked entity (Dashboard card, Automation block, Pipeline, Deal, Kanban card)
  function matchesActiveEntity(log) {
    if (!currentActiveContext) return true;

    // 1. Dashboard Widget Filter
    const activeWidget = (currentActiveContext.dashboardWidget || '').trim().toLowerCase();
    if (activeWidget) {
      const logUrl = (log.data?.url || '').trim().toLowerCase();
      if (activeWidget.includes('negócio') || activeWidget.includes('deals')) {
        return logUrl.includes('negocio') || logUrl.includes('deal');
      }
      if (activeWidget.includes('ganho') || activeWidget.includes('win')) {
        return logUrl.includes('ganho') || logUrl.includes('win');
      }
      if (activeWidget.includes('perdido') || activeWidget.includes('lose') || activeWidget.includes('lost')) {
        return logUrl.includes('perdido') || logUrl.includes('lost') || logUrl.includes('lose');
      }
      if (activeWidget.includes('aberto') || activeWidget.includes('open')) {
        return logUrl.includes('aberto') || logUrl.includes('open');
      }
      if (activeWidget.includes('diário') || activeWidget.includes('daily')) {
        return logUrl.includes('diario') || logUrl.includes('daily') || logUrl.includes('stats');
      }
      if (activeWidget.includes('atendente') || activeWidget.includes('agent')) {
        return logUrl.includes('atendente') || logUrl.includes('agent') || logUrl.includes('user');
      }
      return true; // Keep others
    }

    // 2. Automation Block Filter
    const activeBlock = (currentActiveContext.blockName || '').trim().toLowerCase();
    const activeBlockId = (currentActiveContext.blockId || '').trim().toLowerCase();
    if (activeBlock || activeBlockId) {
      const logCtx = log.data?.context || {};
      const logBlock = (logCtx.blockName || '').trim().toLowerCase();
      const logBlockId = (logCtx.blockId || '').trim().toLowerCase();
      
      if (activeBlockId && logBlockId && activeBlockId === logBlockId) {
        return true;
      }
      if (logBlock && activeBlock) {
        return logBlock.includes(activeBlock) || activeBlock.includes(logBlock);
      }
      return false;
    }

    // 3. Pipeline Filter
    const activePipeline = (currentActiveContext.pipelineName || '').trim().toLowerCase();
    const activePipelineId = (currentActiveContext.pipelineId || '').trim().toLowerCase();
    if (activePipeline || activePipelineId) {
      const logCtx = log.data?.context || {};
      const logPipeline = (logCtx.pipelineName || '').trim().toLowerCase();
      const logPipelineId = (logCtx.pipelineId || '').trim().toLowerCase();
      const logUrl = (log.data?.url || '').trim().toLowerCase();
      
      if (activePipelineId && logPipelineId && activePipelineId === logPipelineId) {
        return true;
      }
      if (logPipeline && activePipeline) {
        return logPipeline.includes(activePipeline) || activePipeline.includes(logPipeline);
      }
      const cleanPipeline = activePipeline.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (activePipeline && (logUrl.includes(cleanPipeline) || logUrl.includes('pipeline'))) {
        return true;
      }
      if (activePipelineId && logUrl.includes(activePipelineId)) {
        return true;
      }
      return false;
    }

    // 4. Deal Filter
    const activeDealId = (currentActiveContext.dealId || '').trim().toLowerCase();
    const activeDealName = (currentActiveContext.dealName || '').trim().toLowerCase();
    if (activeDealId || activeDealName) {
      const logCtx = log.data?.context || {};
      const logDealId = (logCtx.dealId || '').trim().toLowerCase();
      const logDealName = (logCtx.dealName || '').trim().toLowerCase();
      const logUrl = (log.data?.url || '').trim().toLowerCase();
      const logBody = typeof log.data?.body === 'string' ? log.data.body.toLowerCase() : '';
      
      if (activeDealId && logDealId && activeDealId === logDealId) return true;
      if (activeDealName && logDealName && activeDealName.includes(logDealName)) return true;
      if (activeDealId && (logUrl.includes(activeDealId) || logBody.includes(activeDealId))) return true;
      if (activeDealName && (logUrl.includes(activeDealName) || logBody.includes(activeDealName))) return true;
      
      return false;
    }

    // 5. Kanban Card Filter
    const activeCardName = (currentActiveContext.cardName || '').trim().toLowerCase();
    if (activeCardName) {
      const logCtx = log.data?.context || {};
      const logCardName = (logCtx.cardName || '').trim().toLowerCase();
      const logUrl = (log.data?.url || '').trim().toLowerCase();
      const logBody = typeof log.data?.body === 'string' ? log.data.body.toLowerCase() : '';

      if (logCardName && (logCardName.includes(activeCardName) || activeCardName.includes(logCardName))) return true;
      const cleanCardName = activeCardName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (logUrl.includes(cleanCardName) || logBody.includes(cleanCardName)) return true;

      return false;
    }

    return true;
  }

  // 4. Update filter pill badge counts (Contextualized by URL Area unless pinned)
  function updateBadgesCount() {
    const counts = {
      all: 0,
      meta: 0,
      unofficial: 0,
      universal: 0,
      database: 0,
      system: 0
    };

    allLogs.forEach(log => {
      const translated = CrazyTranslator.translate(log);
      const catClass = translated.categoryClass;

      // Pinned logs bypass contextual/entity filters but must still be counted under all categories
      const isGlobalError = log.pinned || translated.categoryClass === 'tag-system' || log.type === 'WS_CLOSE' || log.type === 'WS_ERROR' || log.type?.startsWith('SECURITY_') || log.type?.startsWith('BUG_');
      if (!isGlobalError) {
        // Check if error is relevant to the current page module
        if (contextMode === 'page') {
          const isContextuallyActive = isSameArea(log.data?.pageUrl, currentTabUrl, log);
          if (!isContextuallyActive) return;
        }

        // Filter by active lead context
        if (!matchesActiveLead(log)) return;

        // Filter by active connection context
        if (!matchesActiveConnection(log)) return;

        // Filter by active clicked entity context
        if (!matchesActiveEntity(log)) return;

        // Filter by active company context
        if (!matchesActiveCompany(log)) return;
      }

      counts.all++;

      if (catClass === 'tag-meta') counts.meta++;
      else if (catClass === 'tag-unofficial') counts.unofficial++;
      else if (catClass === 'tag-universal') counts.universal++;
      else if (catClass === 'tag-database') counts.database++;
      else if (catClass === 'tag-system' || catClass === 'tag-console' || catClass === 'tag-uialert') counts.system++;
    });

    // Update UI badges
    for (const key in badges) {
      if (badges[key]) {
        badges[key].textContent = counts[key];
      }
    }
  }

  // 5. Render lists based on filter & url context
  function renderLogs() {
    // Filter logs
    const filteredLogs = allLogs.filter(log => {
      const translated = CrazyTranslator.translate(log);
      const catClass = translated.categoryClass;

      // A. Category Filter
      if (currentFilter !== 'all') {
        const matchesFilter = (currentFilter === 'meta' && catClass === 'tag-meta') ||
              (currentFilter === 'unofficial' && catClass === 'tag-unofficial') ||
              (currentFilter === 'universal' && catClass === 'tag-universal') ||
              (currentFilter === 'database' && catClass === 'tag-database') ||
              (currentFilter === 'system' && (catClass === 'tag-system' || catClass === 'tag-console' || catClass === 'tag-uialert'));
        
        if (!matchesFilter) return false;
      }

      // A2. Search Filter
      const searchInput = document.getElementById('search-input');
      const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
      if (searchQuery) {
        const technicalMessage = log.data?.message || log.data?.errorDetail?.errorMessage || '';
        const technicalCode = log.data?.errorDetail?.errorCode || '';
        const ctx = log.data?.context || {};
        
        const searchText = (
          (translated.title || '') + ' ' +
          (translated.meaning || '') + ' ' +
          (translated.solution.join(' ') || '') + ' ' +
          (log.data?.url || '') + ' ' +
          (log.type || '') + ' ' +
          String(technicalMessage) + ' ' +
          String(technicalCode) + ' ' +
          String(log.data?.status || log.data?.statusCode || log.data?.response?.status || '') + ' ' +
          (ctx.leadName || '') + ' ' +
          (ctx.leadPhone || '') + ' ' +
          (ctx.leadId || '') + ' ' +
          (ctx.blockName || '') + ' ' +
          (ctx.automationName || '') + ' ' +
          (ctx.connectionName || '') + ' ' +
          (ctx.companyName || '')
        ).toLowerCase();
        
        if (!searchText.includes(searchQuery)) return false;
      }

      // B. Contextual Filter (Show only if Pinned, or in 'all' mode, or matches the same CRM Area)
      const isGlobalError = log.pinned || translated.categoryClass === 'tag-system' || log.type === 'WS_CLOSE' || log.type === 'WS_ERROR' || log.type?.startsWith('SECURITY_') || log.type?.startsWith('BUG_');
      if (isGlobalError) return true;
      if (contextMode === 'page') {
        const errorPageUrl = log.data?.pageUrl;
        if (!isSameArea(errorPageUrl, currentTabUrl, log)) return false;
      }

      // C. Active Lead Filter
      if (!matchesActiveLead(log)) return false;

      // D. Active Connection Filter
      if (!matchesActiveConnection(log)) return false;

      // E. Active Entity/Widget/Block Filter
      if (!matchesActiveEntity(log)) return false;

      // F. Active Company Filter
      return matchesActiveCompany(log);
    });

    if (filteredLogs.length === 0) {
      logsList.classList.add('hidden');
      emptyState.classList.remove('hidden');
      if (allLogs.length > 0) {
        updateEmptyState('filtered');
      } else {
        updateEmptyState('normal');
      }
      return;
    }

    emptyState.classList.add('hidden');
    logsList.classList.remove('hidden');
    logsList.innerHTML = '';

    filteredLogs.forEach(log => {
      const translated = CrazyTranslator.translate(log);
      const card = createLogCard(log, translated);
      logsList.appendChild(card);
    });
  }

  // Helper to format ISO timestamp to HH:MM:SS
  function formatTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toTimeString().split(' ')[0];
    } catch (e) {
      return '';
    }
  }

  // 6. Create DOM element for log card
  function createLogCard(log, translated) {
    const card = document.createElement('div');
    
    // Resolve left border color based on category class
    let cardCategoryClass = 'card-system';
    const catClass = translated.categoryClass;
    if (catClass === 'tag-meta') cardCategoryClass = 'card-meta';
    else if (catClass === 'tag-unofficial') cardCategoryClass = 'card-unofficial';
    else if (catClass === 'tag-universal') cardCategoryClass = 'card-universal';
    else if (catClass === 'tag-database') cardCategoryClass = 'card-database';
    else if (catClass === 'tag-system') cardCategoryClass = 'card-system';
    else if (catClass === 'tag-console') cardCategoryClass = 'card-console';
    else if (catClass === 'tag-uialert') cardCategoryClass = 'card-uialert';

    card.className = `error-card ${cardCategoryClass}`;
    card.setAttribute('data-id', log.id);

    const formattedTime = formatTime(log.timestamp);
    const friendlyArea = getFriendlyAreaName(log.data?.pageUrl);
    let origin = '';
    if (log.data?.url) {
      try {
        origin = new URL(log.data.url, window.location.origin).pathname;
      } catch (e) {
        origin = log.data.url;
      }
    }
    const initiatorFile = log.data?.initiator?.fileName ? `${log.data.initiator.fileName}:${log.data.initiator.line}` : 'code';

    // Constructing steps HTML
    const stepsHtml = translated.solution.map(step => `<li>${step}</li>`).join('');

    // Prettifying raw JSON payload
    let rawJson = '';
    try {
      rawJson = JSON.stringify(log.data, null, 2);
    } catch (e) {
      rawJson = String(log.data);
    }

    // Context HTML details (Automation Name, Card/Stage, Lead Info)
    let contextHtml = '';
    const ctx = log.data?.context;
    
    // Helper to format phone numbers nicely
    function formatPhoneNumber(phone) {
      if (!phone) return '';
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 13 && digits.startsWith('55')) {
        return `+55 (${digits.substring(2, 4)}) ${digits.substring(4, 9)}-${digits.substring(9)}`;
      }
      if (digits.length === 12 && digits.startsWith('55')) {
        return `+55 (${digits.substring(2, 4)}) ${digits.substring(4, 8)}-${digits.substring(8)}`;
      }
      if (digits.length === 11) {
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
      }
      if (digits.length === 10) {
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
      }
      return phone;
    }

    if (ctx) {
      const pageUrl = log.data?.pageUrl || '';
      
      // A. Check for Automation context details
      const hasAutomationDetails = ctx.automationName || ctx.blockName || ctx.blockError;
      
      // B. Check for Lead/Chat context details
      const hasLeadDetails = ctx.leadName || ctx.leadPhone || ctx.leadId || ctx.cardName;
      
      if (hasAutomationDetails) {
        contextHtml += `
          <div class="context-box automation-context">
            <div class="context-box-title">🤖 Fluxo de Automação</div>
            <div class="context-box-content">
              <div><span class="label">Automação:</span> <strong>${escapeHtml(ctx.automationName || 'Geral')}</strong></div>
              ${ctx.blockName ? `<div><span class="label">Bloco:</span> <strong>${escapeHtml(ctx.blockName)}</strong></div>` : ''}
              ${ctx.blockError ? `<div><span class="label">Erro do Bloco:</span> <strong style="color: var(--color-system);">${escapeHtml(ctx.blockError)}</strong></div>` : ''}
            </div>
          </div>
        `;
      }
      
      if (hasLeadDetails) {
        contextHtml += `
          <div class="context-box lead-context">
            <div class="context-box-title">👤 Vínculo com o Lead</div>
            <div class="context-box-content">
              <div><span class="label">Lead:</span> <strong>${escapeHtml(ctx.leadName || 'Desconhecido')}</strong></div>
              ${ctx.leadPhone ? `<div><span class="label">Número:</span> <strong>${escapeHtml(formatPhoneNumber(ctx.leadPhone))}</strong></div>` : ''}
              ${ctx.leadId ? `<div><span class="label">ID:</span> <span class="sub-text">${escapeHtml(ctx.leadId)}</span></div>` : ''}
              ${ctx.cardName ? `<div><span class="label">Etapa:</span> <strong>${escapeHtml(ctx.cardName)}</strong></div>` : ''}
            </div>
          </div>
        `;
      }

      // Check for Company context details
      const hasCompanyDetails = ctx.companyName || ctx.companyTaxId || ctx.companyId;
      if (hasCompanyDetails) {
        contextHtml += `
          <div class="context-box company-context" style="border-left-color: #e040fb; background: rgba(224, 64, 251, 0.02);">
            <div class="context-box-title" style="color: #e040fb;">🏢 Dados da Empresa</div>
            <div class="context-box-content">
              <div><span class="label">Empresa:</span> <strong>${escapeHtml(ctx.companyName || 'Desconhecida')}</strong></div>
              ${ctx.companyTaxId ? `<div><span class="label">CNPJ/CPF:</span> <strong>${escapeHtml(ctx.companyTaxId)}</strong></div>` : ''}
              ${ctx.companyId ? `<div><span class="label">ID:</span> <span class="sub-text">${escapeHtml(ctx.companyId)}</span></div>` : ''}
            </div>
          </div>
        `;
      }
      
      // Fallback only if we have page context but no explicit details mapped yet
      if (!contextHtml && (pageUrl.includes('lead') || pageUrl.includes('chat') || pageUrl.includes('ticket') || pageUrl.includes('multiservice') || pageUrl.includes('atendimento') || pageUrl.includes('conversa'))) {
        contextHtml = `
          <div class="context-box lead-context">
            <div class="context-box-title">👤 Vínculo com o Lead</div>
            <div class="context-box-content">
              <div><span class="label">Lead:</span> <strong>Desconhecido</strong></div>
              <div style="font-style: italic; color: var(--text-muted); font-size: 10px; margin-top: 4px;">Nenhum metadado de contato capturado na requisição atual.</div>
            </div>
          </div>
        `;
      }
    }

    let refTagsHtml = '';
    if (ctx) {
      if (ctx.leadName || ctx.leadPhone) {
        refTagsHtml += `<span class="ref-tag ref-lead" title="Lead/Contato">👤 ${escapeHtml(ctx.leadName || formatPhoneNumber(ctx.leadPhone))}</span>`;
      }
      if (ctx.blockName) {
        refTagsHtml += `<span class="ref-tag ref-block" title="Bloco Automação">🤖 Bloco: ${escapeHtml(ctx.blockName)}</span>`;
      }
      if (ctx.connectionName) {
        refTagsHtml += `<span class="ref-tag ref-conn" title="Conexão/Canal">🔌 ${escapeHtml(ctx.connectionName)}</span>`;
      }
      if (ctx.dashboardWidget) {
        refTagsHtml += `<span class="ref-tag ref-widget" title="Métrica Dashboard">📊 ${escapeHtml(ctx.dashboardWidget)}</span>`;
      }
      if (ctx.pipelineName) {
        refTagsHtml += `<span class="ref-tag ref-pipeline" title="Funil/Pipeline">🗂️ Funil: ${escapeHtml(ctx.pipelineName)}</span>`;
      }
      if (ctx.companyName) {
        refTagsHtml += `<span class="ref-tag ref-company" style="background: rgba(224, 64, 251, 0.15); color: #e040fb; border: 1px solid rgba(224, 64, 251, 0.3);" title="Empresa: ${escapeHtml(ctx.companyName)}">🏢 ${escapeHtml(ctx.companyName)}</span>`;
      }
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title-area">
          <div class="tag-row">
            <span class="category-tag ${translated.categoryClass}">${translated.categoryName}</span>
            ${translated.gatewayName ? `<span class="gateway-tag">${escapeHtml(translated.gatewayName)}</span>` : ''}
            <span class="area-tag">${escapeHtml(friendlyArea)}</span>
            ${refTagsHtml}
            <span class="timestamp">${formattedTime}</span>
            <button class="btn-pin ${log.pinned ? 'pinned' : ''}" title="${log.pinned ? 'Desafixar erro' : 'Fixar erro (manter visível)'}">
              <svg class="pin-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.47A2 2 0 0 1 15 9.29V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.29a2 2 0 0 1-.78 1.24L5.44 14a2 2 0 0 0-.44 1.24V17z"></path></svg>
            </button>
            <button class="btn-delete" title="Remover este erro">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
          <h2 class="error-title">${translated.title}</h2>
        </div>
        <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>

      <div class="card-body-wrapper">
        <div class="card-body">
          <!-- Abas internas -->
          <div class="card-tabs">
            <button class="tab-btn active" data-tab="user">Usuário</button>
            <button class="tab-btn" data-tab="tech">Técnico</button>
          </div>

          <!-- Conteúdo Usuário -->
          <div class="tab-content-panel active" data-panel="user">
            <div class="user-panel">
              ${contextHtml}
              <div class="explanation-section">
                <strong>O que aconteceu</strong>
                <p>${translated.meaning}</p>
              </div>
              <div class="steps-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Como Resolver
              </div>
              <ul class="solution-steps">
                ${stepsHtml}
              </ul>
            </div>
          </div>

          <!-- Conteúdo Técnico -->
          <div class="tab-content-panel" data-panel="tech">
            <div class="technical-panel">
              <div class="meta-grid">
                <span>Tipo:</span>
                <span>${log.type}</span>
                
                <span>Rota:</span>
                <span>${log.data?.method ? `${log.data.method} ` : ''}${log.data?.url || 'Interno'}</span>
                
                <span>Status:</span>
                <span>${log.data?.status || 'N/A'} ${log.data?.statusText || ''}</span>
                
                <span>Origem:</span>
                <span>${initiatorFile}</span>
              </div>

              <div class="code-block-wrapper">
                <span class="code-title">Payload / Stack Trace:</span>
                <button class="btn-copy-log">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar
                </button>
                <pre class="code-block">${escapeHtml(rawJson)}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 7. Accordion toggle click handler
    const header = card.querySelector('.card-header');
    header.addEventListener('click', (e) => {
      const isExpanded = card.classList.contains('expanded');
      
      // Close other open cards for clean interface
      document.querySelectorAll('.error-card.expanded').forEach(openCard => {
        if (openCard !== card) {
          openCard.classList.remove('expanded');
        }
      });

      card.classList.toggle('expanded', !isExpanded);
    });

    // 8. Pin Button click handler (Stop propagation to prevent accordion toggle)
    const btnPin = card.querySelector('.btn-pin');
    btnPin.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        action: 'TOGGLE_PIN_ERROR',
        tabId: activeTabId,
        errorId: log.id
      }, (response) => {
        if (response?.success) {
          log.pinned = response.pinned;
          if (log.pinned) {
            btnPin.classList.add('pinned');
            btnPin.title = 'Desafixar erro';
          } else {
            btnPin.classList.remove('pinned');
            btnPin.title = 'Fixar erro (manter visível)';
          }
          // Reload logs list to re-evaluate filters & context immediately
          loadLogs();
        }
      });
    });

    // 8.1. Delete Button click handler (Stop propagation to prevent accordion toggle)
    const btnDelete = card.querySelector('.btn-delete');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Deseja realmente remover este log de erro?')) {
        chrome.runtime.sendMessage({
          action: 'DELETE_ERROR',
          tabId: activeTabId,
          errorId: log.id
        }, (response) => {
          if (response?.success) {
            allLogs = allLogs.filter(l => l.id !== log.id);
            updateBadgesCount();
            renderLogs();
          }
        });
      }
    });

    // 9. Tabs internal navigation
    const tabs = card.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid triggering accordion collapse
        const tabType = tab.getAttribute('data-tab');

        card.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        card.querySelectorAll('.tab-content-panel').forEach(panel => panel.classList.remove('active'));

        tab.classList.add('active');
        card.querySelector(`[data-panel="${tabType}"]`).classList.add('active');
      });
    });

    // 10. Clipboard Copy Button
    const btnCopy = card.querySelector('.btn-copy-log');
    btnCopy.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(rawJson).then(() => {
        btnCopy.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Copiado!
        `;
        setTimeout(() => {
          btnCopy.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copiar
          `;
        }, 1500);
      });
    });

    return card;
  }

  // Safe HTML escaper for printing JSON code safely
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 11. Filters pills actions
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      if (moved) return;
      
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter');
      renderLogs();
    });
  });

  // 12. Clear Logs Action
  btnClear.addEventListener('click', () => {
    if (!activeTabId) return;
    if (confirm('Deseja realmente limpar todos os logs de erro capturados nesta aba?')) {
      chrome.runtime.sendMessage({ action: 'CLEAR_ERRORS', tabId: activeTabId }, (response) => {
        if (response?.success) {
          allLogs = [];
          updateBadgesCount();
          renderLogs();
        }
      });
    }
  });

  // 13. Export Logs to Markdown Report
  btnExport.addEventListener('click', () => {
    if (allLogs.length === 0) {
      alert('Nenhum log disponível para exportação.');
      return;
    }

    let report = `# Relatório de Diagnóstico de Erros - DataCrazy CRM\n`;
    report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    report += `Aba ID: ${activeTabId}\n`;
    report += `Quantidade total de registros: ${allLogs.length}\n\n`;
    report += `---\n\n`;

    allLogs.forEach((log, index) => {
      const translated = CrazyTranslator.translate(log);
      report += `## [${index + 1}] ${translated.title} (${translated.categoryName})\n`;
      report += `- **Data/Hora:** ${new Date(log.timestamp).toLocaleString('pt-BR')}\n`;
      report += `- **Tipo Captura:** ${log.type}\n`;
      report += `- **Gravidade:** ${translated.severity.toUpperCase()}\n\n`;
      
      report += `### Explicação Amigável\n`;
      report += `> ${translated.meaning}\n\n`;
      
      report += `### Passos Recomendados para Resolução\n`;
      translated.solution.forEach((step, stepIdx) => {
        const cleanStep = step.replace(/<\/?[^>]+(>|$)/g, "");
        report += `${stepIdx + 1}. ${cleanStep}\n`;
      });
      report += `\n`;

      report += `### Detalhes Técnicos\n`;
      report += `\`\`\`json\n`;
      try {
        report += JSON.stringify(log.data, null, 2);
      } catch (e) {
        report += String(log.data);
      }
      report += `\n\`\`\`\n\n`;
      report += `---\n\n`;
    });

    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_crazydiagnostics_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const exportReportBtn = document.getElementById('export-report-btn');
  if (exportReportBtn) {
    exportReportBtn.addEventListener('click', async () => {
      let reportText = `# Relatório Técnico de Suporte - DataCrazy CRM\n`;
      reportText += `Data e Hora: ${new Date().toLocaleString('pt-BR')}\n\n`;

      // 1. Health Status
      const overallText = document.getElementById('overall-health-text')?.textContent || 'Desconhecido';
      const healthBadge = document.getElementById('overall-health-badge')?.textContent || 'N/A';
      reportText += `## Saúde do CRM\n`;
      reportText += `- Geral: ${overallText} (${healthBadge})\n`;
      
      const pillars = document.querySelectorAll('.pillar-item');
      if (pillars.length > 0) {
        pillars.forEach(p => {
          const dot = p.querySelector('.pillar-dot');
          let status = 'Desconhecido';
          if(dot?.classList.contains('green')) status = 'Saudável';
          else if(dot?.classList.contains('yellow')) status = 'Alerta';
          else if(dot?.classList.contains('red')) status = 'Crítico';
          
          reportText += `- ${p.textContent.trim()}: ${status}\n`;
        });
      }
      reportText += `\n`;

      // 2. Active Context
      reportText += `## Contexto Ativo\n`;
      reportText += `- URL da Página: ${currentTabUrl || 'N/A'}\n`;
      
      if (currentActiveContext) {
        if (currentActiveContext.leadName || currentActiveContext.leadPhone || currentActiveContext.leadId) {
          reportText += `- Lead: ${[currentActiveContext.leadName, currentActiveContext.leadPhone, currentActiveContext.leadId].filter(Boolean).join(' | ')}\n`;
        }
        if (currentActiveContext.companyName || currentActiveContext.companyId) {
          reportText += `- Empresa: ${[currentActiveContext.companyName, currentActiveContext.companyId].filter(Boolean).join(' | ')}\n`;
        }
        if (currentActiveContext.automationName || currentActiveContext.blockName) {
          reportText += `- Automação/Bloco: ${[currentActiveContext.automationName, currentActiveContext.blockName].filter(Boolean).join(' / ')}\n`;
        }
      } else {
        reportText += `- Nenhum contexto de lead, empresa ou automação ativo no momento.\n`;
      }
      reportText += `\n`;

      // 3. Error Logs
      reportText += `## Lista de Erros e Logs Ativos (${allLogs.length})\n`;
      if (allLogs.length === 0) {
        reportText += `Nenhum erro registrado nesta sessão.\n`;
      } else {
        allLogs.forEach((log, idx) => {
          const translated = CrazyTranslator.translate(log);
          reportText += `### [${idx + 1}] ${translated.title}\n`;
          const statusCode = log.data?.status || log.data?.statusCode || log.data?.response?.status || 'N/A';
          reportText += `- Status Code: ${statusCode}\n`;
          reportText += `- URL Afetada: ${log.data?.url || log.data?.pageUrl || 'N/A'}\n`;
          reportText += `- Passos para Solução:\n`;
          translated.solution.forEach((step, sIdx) => {
            const cleanStep = step.replace(/<\/?[^>]+(>|$)/g, "");
            reportText += `  ${sIdx + 1}. ${cleanStep}\n`;
          });
          reportText += `\n`;
        });
      }

      try {
        await navigator.clipboard.writeText(reportText);
        const btnText = exportReportBtn.querySelector('span');
        const originalText = btnText.textContent;
        btnText.textContent = '✓ Copiado!';
        setTimeout(() => {
          btnText.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Falha ao copiar relatório:', err);
      }
    });
  }

  // 14. Open Floating Window Action
  if (btnDetach) {
    btnDetach.addEventListener('click', () => {
      if (activeTabId) {
        chrome.runtime.sendMessage({
          action: 'OPEN_FLOATING_WINDOW',
          tabId: activeTabId
        });
        window.close(); // Close current toolbar popup
      }
    });
  }

  // 14.1. Manual Refresh Action
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      const icon = btnRefresh.querySelector('svg');
      if (icon) {
        icon.classList.add('spin-animation');
        setTimeout(() => {
          icon.classList.remove('spin-animation');
        }, 600);
      }
      initTabContext().then(() => {
        loadLogs();
      });
    });
  }

  // 14.2. Feedback / Bug Report Action
  const btnFeedback = document.getElementById('btn-feedback');
  if (btnFeedback) {
    btnFeedback.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/Deafmss/CrazyDiagnostics/issues/new/choose' });
    });
  }

  // Listen for new errors from background script to update popup dynamically
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'UPDATE_ERRORS_UI' && message.tabId === activeTabId) {
      loadLogs();
    }
  });

  // Initial load
  loadLogs();

  // 15. Dynamic popup resizing system
  {
    const resizeHandles = {
      left: document.getElementById('resize-left'),
      right: document.getElementById('resize-right'),
      bottom: document.getElementById('resize-bottom'),
      bottomLeft: document.getElementById('resize-bottom-left'),
      bottomRight: document.getElementById('resize-bottom-right')
    };

    let isResizing = false;
    let currentResizeType = null; // 'left', 'right', 'bottom', 'bottomLeft', 'bottomRight'
    let startWidth, startHeight, startX, startY;

    // Load saved dimensions if any (synchronous fallback for faster rendering)
    const savedWidth = localStorage.getItem('CD_popup_width');
    const savedHeight = localStorage.getItem('CD_popup_height');
    if (savedWidth) {
      document.body.style.width = savedWidth + 'px';
      document.documentElement.style.width = savedWidth + 'px';
    }
    if (savedHeight) {
      document.body.style.height = savedHeight + 'px';
      document.documentElement.style.height = savedHeight + 'px';
    }

    // Also load from chrome.storage.local as secondary backup
    chrome.storage.local.get(['popup_width', 'popup_height'], (res) => {
      if (res.popup_width && !savedWidth) {
        document.body.style.width = res.popup_width + 'px';
        document.documentElement.style.width = res.popup_width + 'px';
        localStorage.setItem('CD_popup_width', res.popup_width);
      }
      if (res.popup_height && !savedHeight) {
        document.body.style.height = res.popup_height + 'px';
        document.documentElement.style.height = res.popup_height + 'px';
        localStorage.setItem('CD_popup_height', res.popup_height);
      }
    });

    const setupResizeHandler = (type, element) => {
      if (!element) return;
      element.addEventListener('mousedown', (e) => {
        isResizing = true;
        currentResizeType = type;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(document.body).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(document.body).height, 10);
        e.preventDefault();
        e.stopPropagation();
      });
    };

    setupResizeHandler('left', resizeHandles.left);
    setupResizeHandler('right', resizeHandles.right);
    setupResizeHandler('bottom', resizeHandles.bottom);
    setupResizeHandler('bottomLeft', resizeHandles.bottomLeft);
    setupResizeHandler('bottomRight', resizeHandles.bottomRight);

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      let newWidth = startWidth;
      let newHeight = startHeight;

      // Calculate width change based on direction
      if (currentResizeType === 'left' || currentResizeType === 'bottomLeft') {
        newWidth = startWidth + (startX - e.clientX);
      } else if (currentResizeType === 'right' || currentResizeType === 'bottomRight') {
        newWidth = startWidth + (e.clientX - startX);
      }

      // Calculate height change based on direction
      if (currentResizeType === 'bottom' || currentResizeType === 'bottomLeft' || currentResizeType === 'bottomRight') {
        newHeight = startHeight + (e.clientY - startY);
      }

      // Max size allowed by Chrome for popup: 800x600. Min size: 250x200
      newWidth = Math.max(250, Math.min(800, newWidth));
      newHeight = Math.max(200, Math.min(600, newHeight));

      document.body.style.width = newWidth + 'px';
      document.body.style.height = newHeight + 'px';
      document.documentElement.style.width = newWidth + 'px';
      document.documentElement.style.height = newHeight + 'px';
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        currentResizeType = null;
        // Save dimensions so it opens with the same size next time
        const currentWidth = parseInt(document.body.style.width, 10);
        const currentHeight = parseInt(document.body.style.height, 10);
        chrome.storage.local.set({
          popup_width: currentWidth,
          popup_height: currentHeight
        });
        localStorage.setItem('CD_popup_width', currentWidth);
        localStorage.setItem('CD_popup_height', currentHeight);
      }
    });
  }
});
