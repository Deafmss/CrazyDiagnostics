importScripts('translator.js');

// Load dynamic rules at startup
chrome.storage.local.get(['dynamic_rules'], function(result) {
  if (result.dynamic_rules && typeof CrazyTranslator !== 'undefined') {
    CrazyTranslator.loadDynamicRules(result.dynamic_rules);
  }
});

const RULES_URL = 'https://raw.githubusercontent.com/Murillo/CrazyDiagnosticsConfig/main/rules.json';

function syncRemoteRules() {
  fetch(RULES_URL)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return response.json();
    })
    .then(rules => {
      if (rules && typeof rules === 'object') {
        chrome.storage.local.set({ dynamic_rules: rules }, function() {
          console.log('CrazyDiagnostics: Regras remotas sincronizadas com sucesso.');
          if (typeof CrazyTranslator !== 'undefined') {
            CrazyTranslator.loadDynamicRules(rules);
          }
        });
        if (rules.ignoredToasts && Array.isArray(rules.ignoredToasts)) {
          chrome.storage.local.set({ dynamic_ignored_toasts: rules.ignoredToasts });
        }
      }
    })
    .catch(err => {
      console.warn('CrazyDiagnostics: Falha ao sincronizar regras remotas, usando fallback local.', err);
    });
}

const MAX_LOGS_PER_TAB = 100;

// Memory caches to avoid high frequency storage I/O and race conditions
const tabLogsCache = new Map();
const tabConnsCache = new Map();
const logWriteTimeouts = new Map();
const connWriteTimeouts = new Map();
const pendingLogQueues = {};

// === BUG PATTERN DETECTOR ===
const endpointFailures = new Map(); // normalizedUrl -> { count, timestamps[] }
const wsDisconnections = new Map(); // tabId -> { count, timestamps[] }
const PATTERN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ENDPOINT_FAIL_THRESHOLD = 3;
const WS_DISCONNECT_THRESHOLD = 3;

function trackEndpointFailure(url, tabId) {
  if (!url) return null;
  const normalized = url.split('?')[0];
  const now = Date.now();
  
  if (!endpointFailures.has(normalized)) {
    endpointFailures.set(normalized, { count: 0, timestamps: [] });
  }
  
  const entry = endpointFailures.get(normalized);
  entry.timestamps = entry.timestamps.filter(t => (now - t) < PATTERN_WINDOW_MS);
  entry.timestamps.push(now);
  entry.count = entry.timestamps.length;
  
  if (entry.count >= ENDPOINT_FAIL_THRESHOLD) {
    return {
      isBugPattern: true,
      bugType: 'unstable_endpoint',
      failCount: entry.count,
      windowMinutes: PATTERN_WINDOW_MS / 60000
    };
  }
  return null;
}

function trackWSDisconnection(tabId) {
  const now = Date.now();
  
  if (!wsDisconnections.has(tabId)) {
    wsDisconnections.set(tabId, { count: 0, timestamps: [] });
  }
  
  const entry = wsDisconnections.get(tabId);
  entry.timestamps = entry.timestamps.filter(t => (now - t) < PATTERN_WINDOW_MS);
  entry.timestamps.push(now);
  entry.count = entry.timestamps.length;
  
  if (entry.count >= WS_DISCONNECT_THRESHOLD) {
    return {
      isBugPattern: true,
      bugType: 'unstable_websocket',
      disconnectCount: entry.count,
      windowMinutes: PATTERN_WINDOW_MS / 60000
    };
  }
  return null;
}

// Cleanup old pattern entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of endpointFailures) {
    val.timestamps = val.timestamps.filter(t => (now - t) < PATTERN_WINDOW_MS);
    if (val.timestamps.length === 0) endpointFailures.delete(key);
  }
  for (const [key, val] of wsDisconnections) {
    val.timestamps = val.timestamps.filter(t => (now - t) < PATTERN_WINDOW_MS);
    if (val.timestamps.length === 0) wsDisconnections.delete(key);
  }
}, 60000);

// Process queue function to guarantee serial log processing
function processLogQueue(tabId) {
  const queue = pendingLogQueues[tabId];
  if (!queue || queue.length === 0) return;

  const processNext = (existingLogs) => {
    if (queue.length === 0) return;
    const message = queue.shift();

    const entry = {
      id: generateId(),
      type: message.type,
      timestamp: message.timestamp,
      data: message.data,
      occurrenceCount: 1
    };

    // Bug Pattern Detection
    if (entry.type === 'API_HTTP_ERROR' || entry.type === 'BUG_SLOW_API') {
      const pattern = trackEndpointFailure(entry.data?.url, tabId);
      if (pattern) {
        entry.bugPattern = pattern;
      }
    }
    if (entry.type === 'WS_ERROR' || entry.type === 'WS_CLOSE') {
      const pattern = trackWSDisconnection(tabId);
      if (pattern) {
        entry.bugPattern = pattern;
      }
    }

    const entryTranslated = typeof CrazyTranslator !== 'undefined' ? CrazyTranslator.translate(entry) : null;
    const entryTitle = entryTranslated?.title || entry.data?.message || entry.data?.url || entry.data?.errorDetail?.errorMessage || entry.id;
    let entryArea = '';
    try {
      if (entry.data?.pageUrl) {
        entryArea = getRouteSegment(new URL(entry.data.pageUrl));
      }
    } catch(e) {}

    const signature = `${entry.type}:${entry.data?.url || ''}:${entry.data?.errorDetail?.errorCode || entry.data?.message || ''}`;
    let targetSyncLog = entry;

    const duplicate = existingLogs.find(existing => {
      const existingSig = `${existing.type}:${existing.data?.url || ''}:${existing.data?.errorDetail?.errorCode || existing.data?.message || ''}`;
      const timeDiff = entry.timestamp - (existing.timestamp || 0);
      return existingSig === signature && timeDiff <= 60000 && timeDiff >= 0;
    });

    if (duplicate) {
      duplicate.occurrenceCount = (duplicate.occurrenceCount || 1) + 1;
      duplicate.timestamp = entry.timestamp;
      duplicate.lastSeen = entry.timestamp;
      targetSyncLog = duplicate;
      
      const idx = existingLogs.indexOf(duplicate);
      if (idx > -1) {
        existingLogs.splice(idx, 1);
        existingLogs.unshift(duplicate);
      }
    } else {
      entry.occurrenceCount = 1;
      existingLogs.unshift(entry);
    }

    if (existingLogs.length > MAX_LOGS_PER_TAB) {
      existingLogs.pop();
    }

    saveTabLogs(tabId, existingLogs, function() {
      updateBadge(tabId);
      syncErrorToDisk(targetSyncLog);
      chrome.runtime.sendMessage({ action: 'UPDATE_ERRORS_UI', tabId: tabId }).catch(() => {});
      
      if (queue.length > 0) {
        processNext(tabLogsCache.get(tabId));
      }
    });
  };

  if (tabLogsCache.has(tabId)) {
    processNext(tabLogsCache.get(tabId));
  } else {
    getTabLogs(tabId, function(existingLogs) {
      processNext(existingLogs);
    });
  }
}

// Helper to fetch local server token securely at startup
function fetchLocalServerToken() {
  fetch('http://127.0.0.1:3003/get-token')
    .then(r => {
      if (r.ok) return r.json();
      throw new Error('Unauthorized/Offline');
    })
    .then(data => {
      if (data && data.token) {
        chrome.storage.local.set({ mapper_token: data.token }, function() {
          console.log('CrazyDiagnostics: Token do servidor local obtido com sucesso.');
        });
      }
    })
    .catch(err => {
      console.debug('CrazyDiagnostics: Servidor local do mapper offline ou inacessível.');
    });
}

// Helper to get tab logs from cache or storage
function getTabLogs(tabId, callback) {
  if (tabLogsCache.has(tabId)) {
    callback(tabLogsCache.get(tabId));
    return;
  }
  const key = `logs_${tabId}`;
  chrome.storage.local.get([key], function(result) {
    const logs = result[key] || [];
    tabLogsCache.set(tabId, logs);
    callback(logs);
  });
}

// Helper to save tab logs (instant memory update + debounced storage write)
function saveTabLogs(tabId, logs, callback) {
  tabLogsCache.set(tabId, logs);
  
  if (logWriteTimeouts.has(tabId)) {
    clearTimeout(logWriteTimeouts.get(tabId));
  }
  
  const timeoutId = setTimeout(() => {
    logWriteTimeouts.delete(tabId);
    const key = `logs_${tabId}`;
    chrome.storage.local.set({ [key]: logs }, function() {
      // Update badge when actual serialization write completes
      updateBadge(tabId);
    });
  }, 1000); // 1s write debounce
  
  logWriteTimeouts.set(tabId, timeoutId);
  if (callback) callback();
}

// Helper to get tab connections from cache or storage
function getTabConnections(tabId, callback) {
  if (tabConnsCache.has(tabId)) {
    callback(tabConnsCache.get(tabId));
    return;
  }
  const key = `conns_${tabId}`;
  chrome.storage.local.get([key], function(result) {
    const conns = result[key] || {};
    tabConnsCache.set(tabId, conns);
    callback(conns);
  });
}

// Helper to save tab connections (instant memory update + debounced storage write)
function saveTabConnections(tabId, conns, callback) {
  tabConnsCache.set(tabId, conns);
  
  if (connWriteTimeouts.has(tabId)) {
    clearTimeout(connWriteTimeouts.get(tabId));
  }
  
  const timeoutId = setTimeout(() => {
    connWriteTimeouts.delete(tabId);
    const key = `conns_${tabId}`;
    chrome.storage.local.set({ [key]: conns });
  }, 1000); // 1s write debounce
  
  connWriteTimeouts.set(tabId, timeoutId);
  if (callback) callback();
}

// Listen to messages from content script or popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // A. Message coming from content script (new error logged or connections status)
    if (message.source === 'CRAZY_DIAGNOSTICS_CONTENT') {
      const tabId = sender.tab ? sender.tab.id : null;
      if (!tabId) return;

      if (message.type === 'CLEAR_TAB_CACHE') {
        chrome.storage.local.remove([`logs_${tabId}`, `conns_${tabId}`], function() {
          updateBadge(tabId);
          // Alert popup to update its UI
          chrome.runtime.sendMessage({
            action: 'UPDATE_ERRORS_UI',
            tabId: tabId
          }).catch(() => {});
        });
        return;
      }

      if (message.type === 'COMPANY_CHANGED') {
        const newCompany = message.data?.newCompany;
        const sessionKey = `company_${tabId}`;
        chrome.storage.session.get([sessionKey], function(res) {
          const previousCompany = res[sessionKey];
          if (newCompany && newCompany !== previousCompany) {
            chrome.storage.session.set({ [sessionKey]: newCompany }, function() {
              // Clear caches in memory as well
              tabLogsCache.delete(tabId);
              tabConnsCache.delete(tabId);
              chrome.storage.local.remove([`logs_${tabId}`, `conns_${tabId}`], function() {
                updateBadge(tabId);
                // Alert popup to update its UI
                chrome.runtime.sendMessage({
                  action: 'UPDATE_ERRORS_UI',
                  tabId: tabId
                }).catch(() => {});
              });
            });
          }
        });
        return;
      }

    if (message.type === 'CONNECTIONS_DETECTED') {
      getTabConnections(tabId, function(conns) {
        const connectionsList = message.data.connections || [];
        connectionsList.forEach(conn => {
          let provider = 'unknown';
          const typeLower = conn.type.toLowerCase();
          
          if (typeLower.includes('evolution')) provider = 'evolution';
          else if (typeLower.includes('uazapi')) provider = 'uazapi';
          else if (typeLower.includes('z-api') || typeLower.includes('zapi')) provider = 'zapi';
          else if (typeLower.includes('d-api') || typeLower.includes('dapi')) provider = 'dapi';
          else if (typeLower.includes('universal')) provider = 'universal';
          else if (typeLower.includes('instagram')) provider = 'instagram';
          else if (typeLower.includes('messenger')) provider = 'messenger';
          else if (typeLower.includes('facebook')) provider = 'facebook';
          else if (typeLower.includes('meta')) {
            if (typeLower.includes('manual')) provider = 'meta_manual';
            else if (typeLower.includes('coexist')) provider = 'meta_coexistence';
            else provider = 'meta_default';
          }
          else if (typeLower.includes('whatsapp') || typeLower.includes('wpp')) {
            if (typeLower.includes('oficial') || typeLower.includes('official') || typeLower.includes('meta') || typeLower.includes('cloud')) {
              provider = 'whatsapp_official';
            } else {
              provider = 'whatsapp_unofficial';
            }
          }
          
          const connId = conn.id || `${provider}_${conn.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
          conns[connId] = {
            id: conn.id || null,
            provider: provider,
            type: conn.type,
            status: conn.status,
            name: conn.name,
            timestamp: Date.now(),
            companyId: message.data?.context?.companyId || null,
            companyName: message.data?.context?.companyName || null,
            companyTaxId: message.data?.context?.companyTaxId || null
          };
        });
        saveTabConnections(tabId, conns);
      });
      return;
    }

    if (!pendingLogQueues[tabId]) {
      pendingLogQueues[tabId] = [];
    }
    pendingLogQueues[tabId].push(message);

    if (pendingLogQueues[tabId].length === 1) {
      processLogQueue(tabId);
    }

  }

  // B. Message coming from popup (fetching logs, clearing logs, delete, toggle pin, connections, etc)
  if (message.action === 'GET_HEALTH_SCORE') {
    const tabId = message.tabId;
    getTabLogs(tabId, function(logs) {
      let metaHealth = { status: 'HEALTHY' };
      let wsHealth = { status: 'HEALTHY' };
      let apiHealth = { status: 'HEALTHY' };

      let hasCriticalMeta = false;
      let metaWarnings = 0;
      let wsErrors = 0;
      let apiErrors = 0;

      logs.forEach(log => {
        if (log.type === 'SECURITY_JWT_EXPIRED' || log.data?.errorDetail?.errorCode == '190') {
          hasCriticalMeta = true;
        } else {
          const translated = typeof CrazyTranslator !== 'undefined' ? CrazyTranslator.translate(log) : null;
          if (translated?.categoryClass === 'tag-meta') {
            metaWarnings++;
          }
        }
        
        if (log.type === 'WS_CLOSE' || log.bugPattern?.bugType === 'unstable_websocket') {
          wsErrors++;
        }
        
        const is5xx = typeof log.data?.errorDetail?.status === 'number' && log.data.errorDetail.status >= 500 && log.data.errorDetail.status < 600;
        if (log.type === 'BUG_SLOW_API' || (log.type === 'API_HTTP_ERROR' && is5xx)) {
          apiErrors++;
        }
      });

      if (hasCriticalMeta) {
        metaHealth = { status: 'CRITICAL', label: 'Integração Meta Interrompida (Token Expirado)' };
      } else if (metaWarnings > 0) {
        metaHealth = { status: 'WARNING' };
      }

      if (wsErrors > 0) {
        wsHealth = { status: 'UNSTABLE', label: 'WebSocket Instável' };
      }

      if (apiErrors > 0) {
        apiHealth = { status: 'DEGRADED', label: 'Falha nas APIs Backend' };
      }

      let overallScore = 'HEALTHY';
      const statuses = [metaHealth.status, wsHealth.status, apiHealth.status];
      if (statuses.includes('CRITICAL')) overallScore = 'CRITICAL';
      else if (statuses.includes('DEGRADED') || statuses.includes('UNSTABLE')) overallScore = 'DEGRADED';
      else if (statuses.includes('WARNING')) overallScore = 'WARNING';

      sendResponse({
        success: true,
        health: { metaHealth, wsHealth, apiHealth, overallScore }
      });
    });
    return true; // keep channel open
  }

  if (message.action === 'GET_ERRORS') {
    const tabId = message.tabId;
    chrome.storage.local.get(['pinned_errors'], function(result) {
      const pinned = result.pinned_errors || [];
      getTabLogs(tabId, function(logs) {
        // Merge pinned errors into active logs list
        const logIds = new Set(logs.map(l => l.id));
        pinned.forEach(pLog => {
          if (!logIds.has(pLog.id)) {
            pLog.pinned = true;
            logs.push(pLog);
          }
        });
        
        // Sort logs by timestamp descending (using fast string comparison to avoid Date instantiation overhead)
        logs.sort((a, b) => {
          const tA = a.timestamp || '';
          const tB = b.timestamp || '';
          return tB > tA ? 1 : (tB < tA ? -1 : 0);
        });
        sendResponse({ errors: logs });
      });
    });
    return true; // keep channel open
  }

  if (message.action === 'CLEAR_ERRORS') {
    const tabId = message.tabId;
    saveTabLogs(tabId, [], function() {
      updateBadge(tabId);
      sendResponse({ success: true });
    });
    return true; // keep channel open
  }

  if (message.action === 'TOGGLE_PIN_ERROR') {
    const tabId = message.tabId;
    const errorId = message.errorId;
    
    getTabLogs(tabId, function(logs) {
      const log = logs.find(l => l.id === errorId);
      
      if (log) {
        log.pinned = !log.pinned;
        saveTabLogs(tabId, logs, function() {
          chrome.storage.local.get(['pinned_errors'], function(result) {
            let pinned = result.pinned_errors || [];
            if (log.pinned) {
              if (!pinned.some(p => p.id === log.id)) {
                pinned.push(log);
              }
            } else {
              pinned = pinned.filter(p => p.id !== log.id);
            }
            chrome.storage.local.set({ pinned_errors: pinned }, function() {
              sendResponse({ success: true, pinned: log.pinned });
            });
          });
        });
      } else {
        chrome.storage.local.get(['pinned_errors'], function(result) {
          let pinned = result.pinned_errors || [];
          const index = pinned.findIndex(p => p.id === errorId);
          if (index > -1) {
            pinned.splice(index, 1);
            chrome.storage.local.set({ pinned_errors: pinned }, function() {
              sendResponse({ success: true, pinned: false });
            });
          } else {
            sendResponse({ success: false });
          }
        });
      }
    });
    return true; // keep channel open
  }

  if (message.action === 'DELETE_ERROR') {
    const tabId = message.tabId;
    const errorId = message.errorId;
    
    getTabLogs(tabId, function(logs) {
      const updatedLogs = logs.filter(l => l.id !== errorId);
      saveTabLogs(tabId, updatedLogs, function() {
        chrome.storage.local.get(['pinned_errors'], function(result) {
          let pinned = result.pinned_errors || [];
          const updatedPinned = pinned.filter(p => p.id !== errorId);
          chrome.storage.local.set({ pinned_errors: updatedPinned }, function() {
            updateBadge(tabId);
            sendResponse({ success: true });
          });
        });
      });
    });
    return true; // keep channel open
  }

  if (message.action === 'GET_CONNECTIONS') {
    const tabId = message.tabId;
    getTabConnections(tabId, function(conns) {
      sendResponse({ connections: Object.values(conns) });
    });
    return true; // keep channel open
  }

  if (message.action === 'OPEN_FLOATING_WINDOW') {
    chrome.windows.create({
      url: `popup.html?floating=true&tabId=${message.tabId}`,
      type: 'popup',
      width: 460,
      height: 600
    });
    sendResponse({ success: true });
  }

  return true; // keep channel open
});

// Clean up memory when tabs are closed
chrome.tabs.onRemoved.addListener(function(tabId) {
  chrome.storage.local.remove([`logs_${tabId}`, `conns_${tabId}`]);
  chrome.storage.session.remove([`company_${tabId}`]);
  tabLogsCache.delete(tabId);
  tabConnsCache.delete(tabId);
  if (logWriteTimeouts.has(tabId)) {
    clearTimeout(logWriteTimeouts.get(tabId));
    logWriteTimeouts.delete(tabId);
  }
  if (connWriteTimeouts.has(tabId)) {
    clearTimeout(connWriteTimeouts.get(tabId));
    connWriteTimeouts.delete(tabId);
  }
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

// Helper: check if error happened in the same area/module of the CRM
function isSameArea(errorPageUrl, currentTabUrl) {
  if (!errorPageUrl || !currentTabUrl) return true; // Show everything if URLs are unavailable
  try {
    const errUrlObj = new URL(errorPageUrl, 'https://crm.datacrazy.io');
    const currUrlObj = new URL(currentTabUrl, 'https://crm.datacrazy.io');
    
    // If hostname is different (e.g. localhost vs production), skip segment check and show
    if (errUrlObj.hostname !== currUrlObj.hostname) return true;
    
    const errSegment = getRouteSegment(errUrlObj);
    const currSegment = getRouteSegment(currUrlObj);
    
    return errSegment === currSegment;
  } catch (e) {
    return true;
  }
}

// Update badge when tab URL changes (vital for SPAs routing)
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.url) {
    updateBadge(tabId);
  }
});

// Update badge count based on active errors for the tab's current URL context
// Helper to check if a log matches the active selected lead/chat context
function matchesActiveLead(log, currentActiveContext) {
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
    return false; // Mismatch
  }

  return true; // Keep log if no lead is currently active on screen
}

// Helper to check if a log matches the active selected connection/integration context
function matchesActiveConnection(log, currentActiveContext) {
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
function matchesActiveEntity(log, currentActiveContext) {
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

// Helper to check if a log matches the active company context
function matchesActiveCompany(log, currentActiveContext) {
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

    if (!logCompanyId && !logCompanyName && !logCompanyTaxId) {
      return true; // Keep system/network errors without company data
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
    
    // Strict company filtering: if screen is focused on a company, hide logs of other companies or logs without company info.
    return false;
  }

  return true; // Keep log if no company is active on screen
}

// Update badge count based on active errors for the tab's current URL context
async function updateBadge(tabId) {
  getTabLogs(tabId, async function(logs) {
    if (logs.length === 0) {
      chrome.action.setBadgeText({ tabId: tabId, text: '' });
      return;
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      const currentTabUrl = tab?.url || '';
      
      // Query the current page context of the tab dynamically
      chrome.tabs.sendMessage(tabId, { action: 'GET_CURRENT_CONTEXT' }, function(response) {
        // Handle runtime error (e.g. if content script is not loaded yet)
        const err = chrome.runtime.lastError;
        const currentCtx = (!err && response) ? (response.context || null) : null;

        let activeCount = 0;
        logs.forEach(log => {
          // Check contextual area
          const isContextuallyActive = log.pinned || isSameArea(log.data?.pageUrl, currentTabUrl);
          if (!isContextuallyActive) return;

          // Apply page context filters if context is available
          if (currentCtx) {
            if (!matchesActiveLead(log, currentCtx)) return;
            if (!matchesActiveConnection(log, currentCtx)) return;
            if (!matchesActiveEntity(log, currentCtx)) return;
            if (!matchesActiveCompany(log, currentCtx)) return;
          }

          activeCount++;
        });

        if (activeCount > 0) {
          chrome.action.setBadgeText({ tabId: tabId, text: String(activeCount) });
          chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#FF3366' }); // Neon red/pink
        } else {
          chrome.action.setBadgeText({ tabId: tabId, text: '' });
        }
      });
    } catch (err) {
      // Fallback if tab info is blocked or unavailable
      const errorCount = logs.length;
      if (errorCount > 0) {
        chrome.action.setBadgeText({ tabId: tabId, text: String(errorCount) });
        chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#FF3366' });
      } else {
        chrome.action.setBadgeText({ tabId: tabId, text: '' });
      }
    }
  });
}

// Generate simple unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
}

// Alarms and Startup listeners for remote rules synchronization
chrome.runtime.onInstalled.addListener(function() {
  syncRemoteRules();
  fetchLocalServerToken();
  chrome.alarms.create('sync_rules_alarm', { periodInMinutes: 1440 }); // Daily sync
});

chrome.runtime.onStartup.addListener(function() {
  syncRemoteRules();
  fetchLocalServerToken();
  chrome.alarms.get('sync_rules_alarm', function(alarm) {
    if (!alarm) {
      chrome.alarms.create('sync_rules_alarm', { periodInMinutes: 1440 });
    }
  });
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'sync_rules_alarm') {
    syncRemoteRules();
  }
});

// Initial startup token fetch
fetchLocalServerToken();

// Function to sync captured errors directly to workspace disk via local dev server
function syncErrorToDisk(entry) {
  chrome.storage.local.get(['mapper_token'], function(result) {
    const token = result.mapper_token || '';
    try {
      let richEntry = { ...entry };
      if (typeof CrazyTranslator !== 'undefined' && typeof CrazyTranslator.translate === 'function') {
        const translated = CrazyTranslator.translate(entry);
        if (translated) {
          richEntry.translated = {
            title: translated.title,
            categoryName: translated.categoryName,
            categoryClass: translated.categoryClass,
            meaning: translated.meaning,
            solution: translated.solution,
            gatewayName: translated.gatewayName
          };
        }
      }
      
      fetch('http://127.0.0.1:3003/save-error', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Mapper-Token': token
        },
        body: JSON.stringify(richEntry)
      })
      .then(r => r.json())
      .catch(err => {
        // Fail silently if dev server is closed
      });
    } catch (e) {
      // Fail silently
    }
  });
}

