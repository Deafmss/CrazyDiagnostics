(function() {
  // Prevent duplicate injection
  if (window.__CrazyDiagnosticsInjected) return;
  window.__CrazyDiagnosticsInjected = true;

  // Retrieve handshake token from the injected script tag
  const scriptEl = document.currentScript || document.querySelector('script[data-token]');
  let handshakeToken = scriptEl ? scriptEl.getAttribute('data-token') : null;

  if (!handshakeToken) {
    try {
      handshakeToken = document.documentElement.getAttribute('data-crazy-token');
      document.documentElement.removeAttribute('data-crazy-token');
    } catch (e) {}
  }

  // Helper to send postMessage securely to content script
  function sendMessageToContent(type, data) {
    const targetOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';
    window.postMessage({
      source: 'CRAZY_DIAGNOSTICS_INJECTED',
      token: handshakeToken,
      type: type,
      timestamp: new Date().toISOString(),
      data: data
    }, targetOrigin);
  }

  // Helper to send data to the content script
  function sendError(type, data) {
    sendMessageToContent(type, data);
  }

  window.inspectReactFiberNode = function inspectReactFiberNode(domElement) {
    if (!domElement) return null;
    let current = domElement;
    let depth = 0;
    let result = {};
    
    while (current && depth < 10) {
      const keys = Object.keys(current);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      const propsKey = keys.find(k => k.startsWith('__reactProps$'));
      
      if (propsKey && current[propsKey]) {
        const props = current[propsKey];
        extractReactStateProps(props, result);
      }
      
      if (fiberKey && current[fiberKey]) {
        let fiber = current[fiberKey];
        let fiberDepth = 0;
        while (fiber && fiberDepth < 15) {
          if (fiber.memoizedProps) {
            extractReactStateProps(fiber.memoizedProps, result);
          }
          if (fiber.stateNode && fiber.stateNode.props) {
            extractReactStateProps(fiber.stateNode.props, result);
          }
          fiber = fiber.return;
          fiberDepth++;
        }
      }
      
      current = current.parentElement;
      depth++;
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  function extractReactStateProps(props, result) {
    if (!props || typeof props !== 'object') return;
    
    // Extract Lead / Contact
    const leadObj = props.lead || props.contact || props.recipient || props.chat || props.conversation;
    if (leadObj && typeof leadObj === 'object') {
      result.leadId = leadObj.id || leadObj._id || leadObj.uuid || result.leadId;
      result.leadName = leadObj.name || leadObj.pushname || leadObj.title || result.leadName;
      result.leadPhone = leadObj.phone || leadObj.phoneNumber || leadObj.contactId || leadObj.waid || result.leadPhone;
    }
    if (props.leadId || props.contactId) result.leadId = props.leadId || props.contactId || result.leadId;
    if (props.leadName || props.contactName) result.leadName = props.leadName || props.contactName || result.leadName;
    if (props.leadPhone || props.phoneNumber) result.leadPhone = props.leadPhone || props.phoneNumber || result.leadPhone;

    // Extract Automation / Flow / Block
    const flowObj = props.flow || props.automation || props.pipeline || props.sequence;
    if (flowObj && typeof flowObj === 'object') {
      result.automationName = flowObj.name || flowObj.title || result.automationName;
      result.automationId = flowObj.id || flowObj._id || result.automationId;
    }
    const blockObj = props.block || props.node || props.step;
    if (blockObj && typeof blockObj === 'object') {
      result.blockName = blockObj.name || blockObj.title || blockObj.label || result.blockName;
      result.blockId = blockObj.id || blockObj._id || result.blockId;
    }
    if (props.blockName || props.nodeName) result.blockName = props.blockName || props.nodeName || result.blockName;
    if (props.blockId || props.nodeId) result.blockId = props.blockId || props.nodeId || result.blockId;

    // Extract Card / Kanban
    const cardObj = props.card || props.deal || props.opportunity || props.ticket;
    if (cardObj && typeof cardObj === 'object') {
      result.cardName = cardObj.name || cardObj.title || result.cardName;
      result.cardId = cardObj.id || cardObj._id || result.cardId;
    }
  }

  // === BUG DETECTION ENGINE ===
  const requestTracker = new Map(); // URL -> { count, firstSeen }
  const REQUEST_LOOP_THRESHOLD = 25;
  const REQUEST_LOOP_WINDOW_MS = 10000;

  function trackRequest(url) {
    const normalizedUrl = url.split('?')[0]; // Ignore query params
    const now = Date.now();
    const entry = requestTracker.get(normalizedUrl);
    
    if (entry && (now - entry.firstSeen) < REQUEST_LOOP_WINDOW_MS) {
      entry.count++;
      if (entry.count === REQUEST_LOOP_THRESHOLD) {
        sendError('BUG_REQUEST_LOOP', {
          url: normalizedUrl,
          count: entry.count,
          windowSeconds: REQUEST_LOOP_WINDOW_MS / 1000,
          message: `O CRM está repetindo a mesma requisição ${entry.count} vezes em ${REQUEST_LOOP_WINDOW_MS / 1000} segundos`,
          errorDetail: {
            errorCode: 'request_loop',
            errorMessage: `Loop de requisições detectado: ${normalizedUrl} chamada ${entry.count}x em ${REQUEST_LOOP_WINDOW_MS / 1000}s`
          }
        });
      }
    } else {
      requestTracker.set(normalizedUrl, { count: 1, firstSeen: now });
    }
    
    // Cleanup old entries and enforce hard cap
    if (requestTracker.size > 100) {
      let deleted = 0;
      for (const [key, val] of requestTracker) {
        if (now - val.firstSeen > REQUEST_LOOP_WINDOW_MS * 2) {
          requestTracker.delete(key);
          deleted++;
        }
      }
      // Hard cap: if nothing expired, force-delete the oldest entry
      if (deleted === 0 && requestTracker.size > 100) {
        const oldestKey = requestTracker.keys().next().value;
        if (oldestKey) requestTracker.delete(oldestKey);
      }
    }
  }

  // === DOUBLE SUBMIT DETECTOR ===
  const recentPosts = new Map(); // url+body_hash -> timestamp

  function detectDoubleSubmit(url, method, body) {
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return;
    
    const normalizedUrl = url.split('?')[0];
    const bodyHash = body ? String(body).substring(0, 200) : '';
    const key = `${method}:${normalizedUrl}:${bodyHash}`;
    const now = Date.now();
    const lastTime = recentPosts.get(key);
    
    if (lastTime && (now - lastTime) < 500) {
      sendError('BUG_DOUBLE_SUBMIT', {
        url: normalizedUrl,
        method: method,
        timeBetweenMs: now - lastTime,
        message: `Requisição ${method} duplicada em ${now - lastTime}ms — possível falta de debounce no botão`,
        errorDetail: {
          errorCode: 'double_submit',
          errorMessage: `O CRM enviou a mesma requisição ${method} para ${normalizedUrl} duas vezes em ${now - lastTime}ms. Isso indica que o botão não possui proteção contra duplo clique.`
        }
      });
    }
    
    recentPosts.set(key, now);
    
    // Cleanup old entries and enforce hard cap
    if (recentPosts.size > 50) {
      let deleted = 0;
      for (const [k, v] of recentPosts) {
        if (now - v > 5000) {
          recentPosts.delete(k);
          deleted++;
        }
      }
      // Hard cap: force-delete oldest if none expired
      if (deleted === 0 && recentPosts.size > 50) {
        const oldestKey = recentPosts.keys().next().value;
        if (oldestKey) recentPosts.delete(oldestKey);
      }
    }
  }

  let lastDetectedTenantId = null;

  function extractTenantIdFromJWT(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const payloadBase64Url = parts[1];
      const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = atob(payloadBase64);
      const obj = JSON.parse(jsonPayload);
      return obj.tenantId || obj.companyId || obj.company_id || null;
    } catch (e) {
      return null;
    }
  }

  // === JWT SESSION MONITOR ===
  let lastJwtWarning = 0;
  const JWT_WARNING_INTERVAL = 60000; // Only warn once per minute

  function monitorJwtExpiration(token) {
    if (!token) return;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload.exp;
      if (!exp) return;
      
      const now = Math.floor(Date.now() / 1000);
      const timeLeft = exp - now;
      
      if (timeLeft <= 0 && (Date.now() - lastJwtWarning) > JWT_WARNING_INTERVAL) {
        lastJwtWarning = Date.now();
        sendError('SECURITY_JWT_EXPIRED', {
          message: 'Token JWT expirado — sessão inválida',
          expiredAt: new Date(exp * 1000).toISOString(),
          expiredAgo: Math.abs(timeLeft) + ' segundos atrás',
          errorDetail: {
            errorCode: 'jwt_expired',
            errorMessage: 'O token de autenticação expirou. O CRM pode parar de funcionar corretamente a qualquer momento.'
          }
        });
      } else if (timeLeft > 0 && timeLeft <= 300 && (Date.now() - lastJwtWarning) > JWT_WARNING_INTERVAL) {
        lastJwtWarning = Date.now();
        sendError('SECURITY_JWT_EXPIRING', {
          message: `Token JWT expira em ${timeLeft} segundos`,
          expiresAt: new Date(exp * 1000).toISOString(),
          timeLeftSeconds: timeLeft,
          errorDetail: {
            errorCode: 'jwt_expiring_soon',
            errorMessage: `A sessão vai expirar em ${Math.ceil(timeLeft / 60)} minuto(s). Recomendado relogar para evitar erros.`
          }
        });
      }
    } catch(e) {}
  }

  function updateTenantId(tenantId) {
    if (tenantId && tenantId !== lastDetectedTenantId) {
      lastDetectedTenantId = tenantId;
      sendMessageToContent('TENANT_CHANGED', { tenantId: tenantId });
      // Proactively fetch connections for the new tenant
      fetchConnectionsInvisibly();
    }
  }

  // Proactively fetch active connections/instances invisibly in the background
  function fetchConnectionsInvisibly() {
    try {
      // 1. Find JWT token in storage
      let token = null;
      const storages = [];
      if (typeof localStorage !== 'undefined') storages.push(localStorage);
      if (typeof sessionStorage !== 'undefined') storages.push(sessionStorage);

      for (const storage of storages) {
        try {
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            const val = storage.getItem(key);
            if (val && typeof val === 'string') {
              if (val.startsWith('eyJ') && val.split('.').length === 3) {
                token = val;
                break;
              }
              if (val.includes('eyJ') && (val.startsWith('{') || val.startsWith('['))) {
                try {
                  const obj = JSON.parse(val);
                  const t = obj.token || obj.accessToken || obj.access_token || obj.jwt || obj.idToken || obj.id_token;
                  if (t && typeof t === 'string' && t.startsWith('eyJ') && t.split('.').length === 3) {
                    token = t;
                    break;
                  }
                } catch(e) {}
              }
            }
          }
        } catch(e) {}
        if (token) break;
      }

      if (!token) {
        console.debug('CrazyDiagnostics: JWT Token not found in storage yet.');
        return;
      }

      // 2. Construct API URL
      const protocol = window.location.protocol;
      const apiHost = window.location.host.replace(/^crm\./, 'messaging.');
      // Avoid making self-requests on unrelated domains
      if (!apiHost.includes('datacrazy.io') && !apiHost.includes('localhost') && !apiHost.includes('127.0.0.1')) {
        return;
      }
      const apiUrl = `${protocol}//${apiHost}/api/messaging/instances`;

      console.log('CrazyDiagnostics: Fetching active connections invisibly...', apiUrl);

      // Use the original fetch to avoid intercepting our own proactive fetch
      const rawFetch = window.fetch && window.fetch.__original ? window.fetch.__original : window.fetch;
      if (typeof rawFetch !== 'function') return;

      rawFetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (response.ok) return response.json();
        throw new Error('Response not ok: ' + response.status);
      })
      .then(json => {
        if (json) {
          detectConnections(json, apiUrl);
          console.log('CrazyDiagnostics: Active connections fetched successfully.');
        }
      })
      .catch(err => {
        console.warn('CrazyDiagnostics: Error fetching connections invisibly:', err);
      });

    } catch (e) {
      console.warn('CrazyDiagnostics: Error in fetchConnectionsInvisibly:', e);
    }
  }

  // Filter out noisy third-party tracking/analytics requests (GTM, GA, Facebook Pixel, etc.)
  const TRACKING_HOSTNAMES = new Set([
    'google-analytics.com', 'www.google-analytics.com',
    'googletagmanager.com', 'www.googletagmanager.com',
    'doubleclick.net', 'stats.g.doubleclick.net',
    'connect.facebook.net',
    'hotjar.com', 'vars.hotjar.com', 'script.hotjar.com',
    'clarity.ms', 'www.clarity.ms',
    'pixel.wp.com'
  ]);

  function isThirdPartyTrackingUrl(url) {
    if (!url) return false;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      // Check exact match or parent domain match
      if (TRACKING_HOSTNAMES.has(hostname)) return true;
      // Check parent domain (e.g. 'sub.hotjar.com' -> 'hotjar.com')
      const parts = hostname.split('.');
      if (parts.length > 2) {
        const parentDomain = parts.slice(-2).join('.');
        if (TRACKING_HOSTNAMES.has(parentDomain)) return true;
      }
      return false;
    } catch (e) {
      // Fallback for relative URLs or malformed URLs
      return false;
    }
  }

  // Scan successful API responses to detect active connections/integrations
  function detectConnections(obj, url) {
    if (!obj || typeof obj !== 'object') return;
    let detected = [];
    
    function scan(node) {
      if (!node || typeof node !== 'object') return;
      
      const keys = Object.keys(node);
      
      // If node represents a connection/channel
      const hasType = node.type || node.provider || node.channelType || node.platform;
      const hasStatus = node.status || node.state || node.connectionStatus || node.isConnected !== undefined || node.active !== undefined;
      
      if (hasType && hasStatus) {
        const type = String(node.type || node.provider || node.channelType || node.platform).toLowerCase();
        let status = 'PENDING';
        if (node.status || node.state || node.connectionStatus) {
          status = String(node.status || node.state || node.connectionStatus).toUpperCase();
        } else if (node.isConnected !== undefined) {
          status = node.isConnected ? 'CONNECTED' : 'DISCONNECTED';
        } else if (node.active !== undefined) {
          status = node.active ? 'ACTIVE' : 'INACTIVE';
        }
        
        const name = node.name || node.instanceName || node.instance || node.title || node.phoneNumber || 'Conexão Ativa';
        
        const validTypes = ['whatsapp', 'wpp', 'meta', 'evolution', 'zapi', 'z-api', 'dapi', 'd-api', 'uazapi', 'universal', 'instagram', 'messenger', 'facebook'];
        const isMatched = validTypes.some(t => type.includes(t));
        
        if (isMatched) {
          detected.push({
            id: node.id || node._id || node.uuid || node.instanceId || null,
            type: type,
            status: status,
            name: name,
            url: url
          });
        }
      }
      
      if (Array.isArray(node)) {
        node.forEach(scan);
      } else {
        for (const key of keys) {
          if (typeof node[key] === 'object' && node[key] !== null) {
            scan(node[key]);
          }
        }
      }
    }
    
    try {
      scan(obj);
    } catch(e) {}
    
    if (detected.length > 0) {
      sendMessageToContent('CONNECTIONS_DETECTED', { connections: detected });
    }
  }

  // Clean stack trace to find the actual code line that triggered the error
  function parseStack(stack) {
    if (!stack) return null;
    const lines = stack.split('\n');
    let initiator = null;

    // We skip the first line (usually "Error") and standard extension scripts
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Ignore extension-related or injected code lines
      if (line.includes('injected.js') || line.includes('content.js') || line.includes('chrome-extension://')) {
        continue;
      }
      
      // Match typical V8 stack line: "at functionName (url:line:col)" or "at url:line:col"
      const match = line.match(/at\s+(.+?)\s+\((https?:\/\/.+?):(\d+):(\d+)\)/) || 
                    line.match(/at\s+(https?:\/\/.+?):(\d+):(\d+)/);
      if (match) {
        if (match.length === 5) {
          initiator = {
            caller: match[1],
            url: match[2],
            fileName: match[2].split('/').pop(),
            line: parseInt(match[3]),
            column: parseInt(match[4]),
            rawLine: line
          };
        } else {
          initiator = {
            caller: 'anonymous',
            url: match[1],
            fileName: match[1].split('/').pop(),
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            rawLine: line
          };
        }
        break; // Found the first non-extension line, which is the initiator
      }
    }
    return initiator;
  }

  // Helper to clean stack trace, filtering out external library noises (react, lodash, browser extensions)
  function cleanStackTrace(stack) {
    if (!stack) return '';
    return stack.split('\n')
      .filter(line => {
        const lower = line.toLowerCase();
        if (lower.includes('chrome-extension://') || lower.includes('injected.js') || lower.includes('content.js')) return false;
        if (lower.includes('node_modules') || lower.includes('react-dom') || lower.includes('react.development') || lower.includes('scheduler.development') || lower.includes('next/dist/compiled')) return false;
        return true;
      })
      .map(line => line.trim())
      .join('\n');
  }

  // Recursively search for error signatures inside any JSON payload
  function scanJSONForErrors(obj, path = '') {
    const errors = [];
    const visited = new Set();
    
    function scan(node, currentPath) {
      if (!node || typeof node !== 'object') return;
      if (visited.has(node)) return;
      visited.add(node);

      // GraphQL error pattern: root-level 'errors' array
      if (currentPath === '' && Array.isArray(node.errors)) {
        node.errors.forEach((gqlErr, idx) => {
          if (gqlErr && (gqlErr.message || gqlErr.extensions)) {
            errors.push({
              errorCode: gqlErr.extensions?.code || 'graphql_error',
              errorMessage: gqlErr.message || 'Erro GraphQL sem mensagem',
              context: {
                path: gqlErr.path ? gqlErr.path.join('.') : null,
                locations: gqlErr.locations || null
              },
              path: `errors[${idx}]`
            });
          }
        });
      }

      // Validation error patterns
      if (node.validationErrors && typeof node.validationErrors === 'object') {
        const valErrors = Array.isArray(node.validationErrors) ? node.validationErrors : [node.validationErrors];
        valErrors.forEach((ve, idx) => {
          errors.push({
            errorCode: 'validation_error',
            errorMessage: ve.message || ve.msg || JSON.stringify(ve),
            context: { field: ve.field || ve.property || ve.param || null },
            path: `${currentPath}.validationErrors[${idx}]`
          });
        });
      }
      if (node.invalid_fields && typeof node.invalid_fields === 'object') {
        const fields = Array.isArray(node.invalid_fields) ? node.invalid_fields : Object.entries(node.invalid_fields).map(([k, v]) => ({ field: k, message: v }));
        fields.forEach((f, idx) => {
          errors.push({
            errorCode: 'validation_error',
            errorMessage: f.message || f.msg || `Campo inválido: ${f.field || f.name}`,
            context: { field: f.field || f.name || null },
            path: `${currentPath}.invalid_fields[${idx}]`
          });
        });
      }

      // 1. Check for unsupported message warnings from Meta/CRM
      if (node.unsupported === true || node.body === 'unsupported_unknown_message_type' || node.body === 'unknown_message_type' || node.type === 'unknown' || node.type === 'unsupported') {
        const nodeInfo = scanObjectForContactInfo(node) || {};
        const parentInfo = scanObjectForContactInfo(obj) || {};
        const compInfo = scanObjectForCompanyInfo(node) || scanObjectForCompanyInfo(obj) || {};
        const context = {
          leadId: node.leadId || nodeInfo.leadId || parentInfo.leadId || null,
          leadName: node.name || nodeInfo.leadName || parentInfo.leadName || null,
          leadPhone: node.phoneNumber || node.contactId || nodeInfo.leadPhone || parentInfo.leadPhone || null,
          automationName: node.automationName || nodeInfo.automationName || null,
          cardName: node.cardName || nodeInfo.cardName || null,
          companyId: compInfo.companyId || null,
          companyName: compInfo.companyName || null,
          companyTaxId: compInfo.companyTaxId || null
        };

        const isUnknown = node.body === 'unknown_message_type' || node.type === 'unknown';
        errors.push({
          errorCode: isUnknown ? 'unknown_message_type' : 'unsupported_message_type',
          errorMessage: node.body || (isUnknown ? 'Tipo de mensagem desconhecido' : 'Tipo de mensagem não suportada pela META'),
          context: context,
          path: currentPath
        });
      }

      // 2. Check for WhatsApp/Instagram 24-hour session expiration
      if (node.platform && node.lastContactStatus) {
        const status = node.lastContactStatus;
        const lastReceived = status.lastReceivedMessage;
        if (lastReceived && lastReceived.date) {
          const lastReceivedTime = new Date(lastReceived.date).getTime();
          if (!isNaN(lastReceivedTime)) {
            const now = Date.now();
            const diffMs = now - lastReceivedTime;
            if (diffMs > 24 * 60 * 60 * 1000) {
              const platformName = node.platform === 'WHATSAPP' ? 'WhatsApp' : 'Instagram';
              
              // Try to find lead details from root object or nearby nodes
              const nodeInfo = scanObjectForContactInfo(node) || {};
              const parentInfo = scanObjectForContactInfo(obj) || {};
              const compInfo = scanObjectForCompanyInfo(node) || scanObjectForCompanyInfo(obj) || {};
              const context = {
                leadId: node.leadId || nodeInfo.leadId || parentInfo.leadId || null,
                leadName: node.name || nodeInfo.leadName || parentInfo.leadName || null,
                leadPhone: node.phoneNumber || node.contactId || nodeInfo.leadPhone || parentInfo.leadPhone || null,
                platform: node.platform,
                companyId: compInfo.companyId || null,
                companyName: compInfo.companyName || null,
                companyTaxId: compInfo.companyTaxId || null
              };

              errors.push({
                errorCode: 'session_expired_24h',
                errorMessage: `Mais de 24 horas se passaram desde que o destinatário respondeu pela última vez no ${platformName}.`,
                context: context,
                path: currentPath
              });
            }
          }
        }
      }

      // 3. Check if the current object represents a failed message or has error fields
      const hasErrorIndicator = node.status === 'ERROR' || node.status === 'FAILED' || node.type === 'error' || node.erroCode || node.errorCode || node.lastErrorCode || node.lastErrorMessage || node.errorMessage;
      if (hasErrorIndicator) {
        const foundInfo = scanObjectForContactInfo(node) || {};
        const parentInfo = scanObjectForContactInfo(obj) || {};
        const autoInfo = scanObjectForAutomationInfo(node) || {};
        const parentAutoInfo = scanObjectForAutomationInfo(obj) || {};
        const compInfo = scanObjectForCompanyInfo(node) || scanObjectForCompanyInfo(obj) || {};

        const blockId = node.flowBlockId || node.stepId || node.blockId || autoInfo.blockId || parentAutoInfo.blockId || null;
        const blockName = node.blockName || node.stepName || node.flowBlockName || autoInfo.blockName || parentAutoInfo.blockName || null;

        const context = {
          leadId: node.leadId || node.lead_id || foundInfo.leadId || parentInfo.leadId || null,
          leadName: node.leadName || node.lead_name || (node.lead ? node.lead.name : null) || foundInfo.leadName || parentInfo.leadName || null,
          leadPhone: node.leadPhone || node.lead_phone || foundInfo.leadPhone || parentInfo.leadPhone || null,
          automationName: node.automationName || node.flowName || (node.automation ? node.automation.name : null) || autoInfo.automationName || parentAutoInfo.automationName || null,
          blockName: blockName,
          blockId: blockId,
          cardName: node.cardName || (node.card ? node.card.name : null),
          companyId: compInfo.companyId || null,
          companyName: compInfo.companyName || null,
          companyTaxId: compInfo.companyTaxId || null
        };

        errors.push({
          errorCode: node.errorCode || node.erroCode || node.lastErrorCode || 'unknown_code',
          errorMessage: node.errorMessage || node.lastErrorMessage || 'Lógica de fluxo falhou',
          body: node.body || null,
          attendant: node.attendant ? { name: node.attendant.name, email: node.attendant.email } : null,
          contact: node.contact ? { name: node.contact.name, phoneNumber: node.contact.phoneNumber || node.contact.contactId || foundInfo.leadPhone } : null,
          leadId: node.leadId || foundInfo.leadId || null,
          context: context,
          path: currentPath
        });
      }

      // 4. Check for generic error structures
      if (node.error && typeof node.error === 'object') {
        const foundInfo = scanObjectForContactInfo(node.error) || scanObjectForContactInfo(node) || scanObjectForContactInfo(obj) || {};
        const compInfo = scanObjectForCompanyInfo(node.error) || scanObjectForCompanyInfo(node) || scanObjectForCompanyInfo(obj) || {};
        const context = {
          leadId: foundInfo.leadId || null,
          leadName: foundInfo.leadName || null,
          leadPhone: foundInfo.leadPhone || null,
          companyId: compInfo.companyId || null,
          companyName: compInfo.companyName || null,
          companyTaxId: compInfo.companyTaxId || null
        };
        errors.push({
          errorCode: node.error.code || node.error.type || 'api_error',
          errorMessage: node.error.message || JSON.stringify(node.error),
          context: context,
          path: currentPath ? `${currentPath}.error` : 'error'
        });
      }

      // 5. Check common keys directly
      if (node.message && (node.success === false || node.error === true)) {
        const foundInfo = scanObjectForContactInfo(node) || scanObjectForContactInfo(obj) || {};
        const compInfo = scanObjectForCompanyInfo(node) || scanObjectForCompanyInfo(obj) || {};
        const context = {
          leadId: foundInfo.leadId || null,
          leadName: foundInfo.leadName || null,
          leadPhone: foundInfo.leadPhone || null,
          companyId: compInfo.companyId || null,
          companyName: compInfo.companyName || null,
          companyTaxId: compInfo.companyTaxId || null
        };
        errors.push({
          errorCode: node.code || 'api_error',
          errorMessage: node.message,
          context: context,
          path: currentPath
        });
      }

      // Traverse children
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          scan(node[i], `${currentPath}[${i}]`);
        }
      } else {
        for (const key in node) {
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            // Avoid infinite loops on cyclic structures
            if (typeof node[key] === 'object' && node[key] !== null) {
              scan(node[key], currentPath ? `${currentPath}.${key}` : key);
            }
          }
        }
      }
    }

    try {
      scan(obj, path);
    } catch(e) {}
    
    return errors.length > 0 ? errors : null;
  }

  // Scan objects recursively to extract lead/contact context from request or response payloads
  function scanObjectForContactInfo(obj, parentKey = '', visited = new Set()) {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof Element !== 'undefined' && obj instanceof Element) {
      const fiberData = window.inspectReactFiberNode ? window.inspectReactFiberNode(obj) : null;
      if (fiberData && (fiberData.leadId || fiberData.leadName || fiberData.leadPhone)) {
        return {
          leadId: fiberData.leadId,
          leadName: fiberData.leadName,
          leadPhone: fiberData.leadPhone
        };
      }
    }
    if (visited.has(obj)) return null;
    visited.add(obj);
    let info = {};
    try {
      const keys = Object.keys(obj);
      const parentKeyLower = parentKey.toLowerCase();
      
      for (const key of keys) {
        const val = obj[key];
        if (val === undefined || val === null) continue;
        const lowerKey = key.toLowerCase();

        const isSenderOrUserKey = lowerKey.includes('sender') ||
                                  lowerKey.includes('user') ||
                                  lowerKey.includes('attendant') ||
                                  lowerKey.includes('agent') ||
                                  lowerKey.includes('owner') ||
                                  lowerKey.includes('member') ||
                                  lowerKey.includes('collaborator') ||
                                  lowerKey.includes('creator') ||
                                  lowerKey.includes('operator') ||
                                  parentKeyLower.includes('sender') ||
                                  parentKeyLower.includes('user') ||
                                  parentKeyLower.includes('attendant') ||
                                  parentKeyLower.includes('agent');

        // 1. Lead ID (24-char hex)
        if ((lowerKey.includes('id') || lowerKey.includes('key')) && typeof val === 'string' && /^[a-f\d]{24}$/i.test(val) && !isSenderOrUserKey) {
          info.leadId = val;
        }

        // 2. Phone number or chat recipient
        const isPhoneKey = (lowerKey.includes('phone') || 
                            lowerKey.includes('number') || 
                            lowerKey.includes('contactid') || 
                            lowerKey.includes('contact_id') || 
                            lowerKey === 'contact' || 
                            lowerKey === 'recipient' || 
                            lowerKey === 'to' || 
                            lowerKey.includes('jid') || 
                            lowerKey === 'waid' || 
                            lowerKey === 'wa_id' || 
                            lowerKey === 'chatid' ||
                            lowerKey === 'chat_id' ||
                            lowerKey === 'from' ||
                            lowerKey === 'sender' ||
                            lowerKey === 'uid' ||
                            lowerKey === 'userid' ||
                            lowerKey === 'user_id' ||
                            lowerKey === 'tel' ||
                            lowerKey === 'cel' ||
                            lowerKey === 'celular' ||
                            ((lowerKey === 'id' || lowerKey === 'uid') && (parentKeyLower === 'contact' || parentKeyLower === 'sender' || parentKeyLower === 'user' || parentKeyLower === 'profile' || parentKeyLower.includes('lead') || parentKeyLower.includes('contact'))))
                            && !isSenderOrUserKey;

        if (isPhoneKey && (typeof val === 'string' || typeof val === 'number')) {
          const phoneStr = String(val).replace(/\D/g, '');
          if (phoneStr.length >= 8 && phoneStr.length <= 15) {
            info.leadPhone = phoneStr;
          }
        }

        // 3. Lead or contact name (Must not be a pure phone number/ID string)
        const isNameKey = (lowerKey.includes('name') || 
                           lowerKey.includes('nome') || 
                           lowerKey === 'lead' || 
                           lowerKey === 'contact' ||
                           lowerKey === 'sender' ||
                           lowerKey === 'profile' ||
                           lowerKey.includes('pushname') ||
                           lowerKey.includes('display'))
                           && !isSenderOrUserKey;

        if (isNameKey && typeof val === 'string' && val.length > 2 && val.length < 50) {
          if (!/^\d+$/.test(val.replace(/[-\s()]/g, ''))) {
            if (!lowerKey.includes('file') && !lowerKey.includes('type') && !lowerKey.includes('error') && !lowerKey.includes('block') && !lowerKey.includes('flow') && !lowerKey.includes('automation') && !lowerKey.includes('instance')) {
              info.leadName = val;
            }
          }
        }
      }

      // Check nested objects if not fully resolved
      if (!info.leadName || !info.leadPhone || !info.leadId) {
        for (const key of keys) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            const nested = scanObjectForContactInfo(val, key, visited);
            if (nested) {
              info = { ...nested, ...info };
            }
          }
        }
      }
    } catch (e) {}
    return Object.keys(info).length > 0 ? info : null;
  }

  // Scan objects recursively to extract company details
  function scanObjectForCompanyInfo(obj, parentKey = '', visited = new Set()) {
    if (!obj || typeof obj !== 'object') return null;
    if (visited.has(obj)) return null;
    visited.add(obj);
    let info = {};
    try {
      const keys = Object.keys(obj);
      for (const key of keys) {
        const val = obj[key];
        if (val === undefined || val === null) continue;
        const lowerKey = key.toLowerCase();
        
        if (lowerKey === 'companyid' || lowerKey === 'company_id' || (lowerKey === 'id' && parentKey.toLowerCase() === 'company')) {
          info.companyId = String(val);
        }
        if (lowerKey === 'companyname' || lowerKey === 'company_name' || (lowerKey === 'name' && parentKey.toLowerCase() === 'company')) {
          info.companyName = String(val);
        }
        if (lowerKey === 'taxid' || lowerKey === 'cnpj' || lowerKey === 'companytaxid' || lowerKey === 'document' || lowerKey === 'documento') {
          info.companyTaxId = String(val).replace(/\D/g, '');
        }
      }
      
      // Recurse
      if (!info.companyId || !info.companyName || !info.companyTaxId) {
        for (const key of keys) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            const nested = scanObjectForCompanyInfo(val, key, visited);
            if (nested) {
              info = { ...nested, ...info };
            }
          }
        }
      }
    } catch(e) {}
    return Object.keys(info).length > 0 ? info : null;
  }

  // Scan objects recursively to extract automation details
  function scanObjectForAutomationInfo(obj, parentKey = '', visited = new Set()) {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof Element !== 'undefined' && obj instanceof Element) {
      const fiberData = window.inspectReactFiberNode ? window.inspectReactFiberNode(obj) : null;
      if (fiberData && (fiberData.automationName || fiberData.blockName || fiberData.blockId)) {
        return {
          automationName: fiberData.automationName,
          blockName: fiberData.blockName,
          blockId: fiberData.blockId
        };
      }
    }
    if (visited.has(obj)) return null;
    visited.add(obj);
    let info = {};
    try {
      const keys = Object.keys(obj);
      for (const key of keys) {
        const val = obj[key];
        if (val === undefined || val === null) continue;
        const lowerKey = key.toLowerCase();
        
        if (lowerKey === 'flowblockid' || lowerKey === 'stepid' || lowerKey === 'blockid') {
          info.blockId = String(val);
        }
        if (lowerKey === 'blockname' || lowerKey === 'stepname' || lowerKey === 'flowblockname') {
          info.blockName = String(val);
        }
        if (lowerKey === 'flowname' || lowerKey === 'automationname') {
          info.automationName = String(val);
        }
      }
      
      // Recurse
      if (!info.blockId || !info.blockName || !info.automationName) {
        for (const key of keys) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            const nested = scanObjectForAutomationInfo(val, key, visited);
            if (nested) {
              info = { ...nested, ...info };
            }
          }
        }
      }
    } catch(e) {}
    return Object.keys(info).length > 0 ? info : null;
  }

  // Helper to extract authorization header value from different headers formats (object, array, Headers)
  function getAuthHeaderValue(headers) {
    if (!headers) return '';
    try {
      if (typeof headers.get === 'function') {
        return headers.get('authorization') || '';
      }
      if (Array.isArray(headers)) {
        for (const pair of headers) {
          if (pair && pair.length >= 2 && String(pair[0]).toLowerCase() === 'authorization') {
            return String(pair[1]);
          }
        }
      } else if (typeof headers === 'object') {
        const keys = Object.keys(headers);
        for (const k of keys) {
          if (k.toLowerCase() === 'authorization') {
            return String(headers[k]);
          }
        }
      }
    } catch (e) {}
    return '';
  }

  // Asynchronous processor for fetch responses to avoid lag on main CRM request
  async function processFetchResponseAsync(clone, urlString, method, headers, requestBody, initiator, requestContext) {
    try {
      // Security: Track authorization failures
      if (clone.status === 401 || clone.status === 403) {
        sendError('SECURITY_AUTH_FAILURE', {
          url: urlString,
          method: method,
          status: clone.status,
          statusText: clone.statusText,
          message: clone.status === 401 ? 'Requisição não autorizada (401)' : 'Acesso negado (403)',
          errorDetail: {
            errorCode: clone.status === 401 ? 'unauthorized' : 'forbidden',
            errorMessage: clone.status === 401 
              ? 'O servidor rejeitou a requisição por falta de autenticação. O token pode ter expirado.'
              : 'O usuário não tem permissão para acessar este recurso. Verifique as permissões do perfil.'
          },
          context: requestContext
        });
      }

      const contentType = clone.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if (contentType.includes('text/html')) {
          try {
            const htmlText = await clone.clone().text();
            const lowerHtml = htmlText.toLowerCase();
            if (lowerHtml.includes('502 bad gateway') || lowerHtml.includes('504 gateway timeout') || lowerHtml.includes('500 internal server error') || lowerHtml.includes('404 this page could not be found')) {
              sendError('API_HTTP_ERROR', {
                url: urlString,
                method: method,
                status: clone.status === 200 ? 502 : clone.status,
                statusText: 'Servidor retornou página de erro HTML (Status 200)',
                initiator: initiator,
                errorDetail: {
                  errorCode: 'html_error_page',
                  errorMessage: 'O servidor retornou uma página de erro HTML (502/504/404) mascarada em status HTTP 200.'
                },
                rawResponse: htmlText.substring(0, 500),
                context: requestContext
              });
              return;
            }
          } catch(e) {}
        }

        if (!clone.ok) {
          sendError('API_HTTP_ERROR', {
            url: urlString,
            method: method,
            status: clone.status,
            statusText: clone.statusText,
            initiator: initiator,
            errorDetail: { errorCode: 'http_error_' + clone.status, errorMessage: `Falha na requisição: ${clone.statusText}` },
            rawResponse: null,
            context: requestContext
          });
        }
        return;
      }

      const json = await clone.json();
      let compInfo = scanObjectForCompanyInfo(json) || {};
      if (urlString && (urlString.includes('/company') || urlString.includes('/companies'))) {
        if (json && typeof json === 'object') {
          compInfo.companyId = compInfo.companyId || json.id || json.uuid || json._id || null;
          compInfo.companyName = compInfo.companyName || json.name || json.title || null;
          if (json.cnpj || json.taxId || json.document || json.documento) {
            compInfo.companyTaxId = compInfo.companyTaxId || String(json.cnpj || json.taxId || json.document || json.documento).replace(/\D/g, '');
          }
        }
      }
      const autoInfo = scanObjectForAutomationInfo(json) || {};

      if (clone.ok) {
        detectConnections(json, urlString);

        // Bug Detection: Empty responses on data endpoints
        const isDataEndpoint = /\/(leads|messages|contacts|instances|conversations|chats|tickets|deals|pipelines|automations|flows|campaigns|templates|tags|users|companies|departments)/i.test(urlString);
        if (isDataEndpoint && method === 'GET') {
          const isEmpty = (Array.isArray(json) && json.length === 0) ||
                          (json && typeof json === 'object' && !Array.isArray(json) && (
                            (json.data !== undefined && (json.data === null || (Array.isArray(json.data) && json.data.length === 0))) ||
                            (Object.keys(json).length === 0)
                          ));
          if (isEmpty) {
            sendError('BUG_EMPTY_RESPONSE', {
              url: urlString,
              method: method,
              status: clone.status,
              message: 'O servidor respondeu com sucesso mas não retornou nenhum dado',
              errorDetail: {
                errorCode: 'empty_response',
                errorMessage: `Resposta vazia em ${urlString} — dados esperados mas não retornados`
              },
              context: { ...requestContext, ...compInfo }
            });
          }
        }

        const detectedErrors = scanJSONForErrors(json);
        if (detectedErrors) {
          detectedErrors.forEach(err => {
            sendError('API_LOGICAL_ERROR', {
              url: urlString,
              method: method,
              status: clone.status,
              statusText: clone.statusText,
              initiator: initiator,
              errorDetail: err,
              rawResponse: json,
              context: {
                ...requestContext,
                ...compInfo,
                ...autoInfo,
                ...err.context
              }
            });
          });
        }
      } else {
        const detectedErrors = scanJSONForErrors(json);
        if (detectedErrors && detectedErrors.length > 0) {
          detectedErrors.forEach(err => {
            sendError('API_HTTP_ERROR', {
              url: urlString,
              method: method,
              status: clone.status,
              statusText: clone.statusText,
              initiator: initiator,
              errorDetail: err,
              rawResponse: json,
              context: {
                ...requestContext,
                ...compInfo,
                ...autoInfo,
                ...err.context
              }
            });
          });
        } else {
          sendError('API_HTTP_ERROR', {
            url: urlString,
            method: method,
            status: clone.status,
            statusText: clone.statusText,
            initiator: initiator,
            errorDetail: {
              errorCode: 'http_error_' + clone.status,
              errorMessage: json.message || json.error || clone.statusText || 'Erro de requisição'
            },
            rawResponse: json,
            context: {
              ...requestContext,
              ...compInfo,
              ...autoInfo
            }
          });
        }
      }
    } catch (e) {
      const isJson = (clone.headers.get('content-type') || '').includes('application/json');
      const url = urlString;
      if (!clone.ok) {
        if (!navigator.onLine) {
          sendError('NETWORK_OFFLINE_LOCAL', {
            url: urlString,
            method: method,
            status: clone.status,
            statusText: clone.statusText,
            message: 'Conexão Desconectada - Sua internet local caiu.',
            errorDetail: { errorCode: 'offline', errorMessage: 'Sem internet local' },
            context: requestContext
          });
        } else {
          sendError('API_HTTP_ERROR', {
            url: urlString,
            method: method,
            status: clone.status,
            statusText: clone.statusText,
            initiator: initiator,
            errorDetail: { errorCode: 'network_fail', errorMessage: 'HTTP falhou e retorno não é JSON válido' },
            rawResponse: null,
            context: requestContext
          });
        }
      } else if (clone.status === 200 && isJson) {
        sendMessageToContent('API_HTTP_ERROR', {
          message: 'Resposta JSON malformada (Status 200)',
          statusCode: 200,
          method: method,
          url: url,
          errorDetail: { errorMessage: 'O servidor retornou status 200 mas o corpo da resposta não é um JSON válido.' }
        });
      }
    }
  }

  // ----------------- INTERCEPT WINDOW FETCH -----------------
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const firstArg = args[0];
    let urlString = '';
    let method = 'GET';
    let headersObj = null;

    if (firstArg && typeof firstArg === 'object' && 'url' in firstArg) {
      urlString = firstArg.url;
      method = firstArg.method || 'GET';
      headersObj = firstArg.headers;
    } else {
      urlString = typeof firstArg === 'string' ? firstArg : (firstArg instanceof URL ? firstArg.href : '');
    }

    // Ignore third-party tracking/analytics requests to avoid noise
    if (isThirdPartyTrackingUrl(urlString)) {
      return originalFetch.apply(this, args);
    }

    const options = args[1] || {};
    method = options.method || method || 'GET';
    const requestHeaders = options.headers || headersObj;

    // Extract tenant/token from fetch request
    try {
      if (urlString) {
        const tokenMatch = urlString.match(/[?&]token=([^&]+)/) || urlString.match(/[?&]access_token=([^&]+)/);
        if (tokenMatch) {
          const tenantId = extractTenantIdFromJWT(tokenMatch[1]);
          if (tenantId) updateTenantId(tenantId);
        }
      }
      const authHeader = getAuthHeaderValue(requestHeaders);
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwtToken = authHeader.substring(7);
        const tenantId = extractTenantIdFromJWT(jwtToken);
        if (tenantId) updateTenantId(tenantId);
        monitorJwtExpiration(jwtToken); // ADD THIS
      }
    } catch (e) {}
    
    // Capture the stack trace at the exact moment fetch is called
    const callStack = new Error().stack;
    const initiator = parseStack(callStack);

    // Extract context from request URL or body
    let requestContext = {
      companyId: lastDetectedTenantId
    };
    try {
      if (urlString) {
        // Extract 24-char ObjectId
        const idMatch = urlString.match(/\/([a-f\d]{24})(\/|\?|$)/i);
        if (idMatch) {
          requestContext.leadId = idMatch[1];
        }
        // Extract phone number from URL (e.g. 5511999999999)
        const phoneMatch = urlString.match(/(?:phone|number|to|chatId|jid|waid|recipient)\/(\d{10,15})/i) || 
                           urlString.match(/[=\/](55\d{8,11})/);
        if (phoneMatch) {
          requestContext.leadPhone = phoneMatch[1];
        }
        // Extract pipelineId (UUID) from URL
        const pipelineMatch = urlString.match(/\/pipelines\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i);
        if (pipelineMatch) {
          requestContext.pipelineId = pipelineMatch[1];
        }
        // Extract companyId (UUID) from URL
        const companyMatch = urlString.match(/\/company\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i) ||
                             urlString.match(/\/companies\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i);
        if (companyMatch) {
          requestContext.companyId = companyMatch[1];
        }
      }

      const bodyPayload = options.body;
      if (bodyPayload) {
        let bodyObj = null;
        if (typeof bodyPayload === 'string') {
          try {
            bodyObj = JSON.parse(bodyPayload);
          } catch(e) {}
        }
        if (bodyObj) {
          const foundInfo = scanObjectForContactInfo(bodyObj);
          if (foundInfo) {
            requestContext = { ...requestContext, ...foundInfo };
          }
          const compInfo = scanObjectForCompanyInfo(bodyObj);
          if (compInfo) {
            requestContext = { ...requestContext, ...compInfo };
          }
          const autoInfo = scanObjectForAutomationInfo(bodyObj);
          if (autoInfo) {
            requestContext = { ...requestContext, ...autoInfo };
          }
        }
      }
    } catch(e) {}

    try {
      trackRequest(urlString);
      detectDoubleSubmit(urlString, method, options.body);
      
      requestContext = {
        ...requestContext,
        ...scanObjectForContactInfo(options.body),
        ...scanObjectForAutomationInfo(options.body),
        url: urlString,
        pageUrl: window.location.href,
        timestamp: new Date().toISOString()
      };

      const fetchStartTime = Date.now();
      const response = await originalFetch.apply(this, args);
      const fetchDuration = Date.now() - fetchStartTime;
      if (fetchDuration > 10000) {
        sendError('BUG_SLOW_API', {
          url: urlString,
          method: method,
          durationMs: fetchDuration,
          durationSeconds: (fetchDuration / 1000).toFixed(1),
          status: response.status,
          message: `API demorou ${(fetchDuration / 1000).toFixed(1)} segundos para responder`,
          errorDetail: {
            errorCode: 'slow_api',
            errorMessage: `Requisição para ${urlString} levou ${(fetchDuration / 1000).toFixed(1)}s (limite: 10s)`
          }
        });
      }
      
      // Process response in the background asynchronously to avoid blocking the CRM application thread
      if (response && typeof response.clone === 'function') {
        const clone = response.clone();
        setTimeout(() => {
          processFetchResponseAsync(clone, urlString, method, requestHeaders, options.body, initiator, requestContext);
        }, 0);
      }
      
      return response;
    } catch (err) {
      // Network crash (CORS, offline, DNS fail)
      if (!navigator.onLine) {
        sendError('NETWORK_OFFLINE_LOCAL', {
          url: urlString,
          method: method,
          status: 0,
          statusText: 'Offline',
          message: 'Conexão Desconectada - Sua internet local caiu.',
          errorDetail: { errorCode: 'offline', errorMessage: 'Sem internet local' },
          context: requestContext
        });
      } else {
        sendError('API_NETWORK_ERROR', {
          url: urlString,
          method: method,
          status: 0,
          statusText: 'Network Failure / CORS Blocked',
          initiator: initiator,
          errorDetail: { errorCode: 'dns_cors_offline', errorMessage: err.message || 'Falha de conexão com a API' },
          context: requestContext
        });
      }
      throw err;
    }
  };
  window.fetch.__original = originalFetch;

  // ----------------- INTERCEPT XMLHTTPREQUEST -----------------
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function(header, value, ...args) {
    if (header.toLowerCase() === 'authorization' && String(value).startsWith('Bearer ')) {
      try {
        const token = String(value).substring(7);
        const tenantId = extractTenantIdFromJWT(token);
        if (tenantId) updateTenantId(tenantId);
        monitorJwtExpiration(token); // ADD THIS
      } catch (e) {}
    }
    return originalSetRequestHeader.apply(this, [header, value, ...args]);
  };

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._method = method;
    this._url = url;
    this.__crazyUrl = url;
    this.__crazyMethod = method;
    // Capture stack trace on open/send
    this._callStack = new Error().stack;
    const result = originalOpen.apply(this, [method, url, ...args]);
    this.__crazyStartTime = null;
    return result;
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;

    // Ignore third-party tracking/analytics requests to avoid noise
    if (isThirdPartyTrackingUrl(xhr._url)) {
      return originalSend.apply(this, args);
    }

    const initiator = parseStack(xhr._callStack);

    // Extract tenant/token from XHR URL
    try {
      const urlString = xhr._url;
      if (urlString) {
        const tokenMatch = urlString.match(/[?&]token=([^&]+)/) || urlString.match(/[?&]access_token=([^&]+)/);
        if (tokenMatch) {
          const tenantId = extractTenantIdFromJWT(tokenMatch[1]);
          if (tenantId) updateTenantId(tenantId);
        }
      }
    } catch (e) {}

    // Extract context from request URL or body
    let requestContext = {
      companyId: lastDetectedTenantId
    };
    try {
      const urlString = xhr._url;
      if (urlString) {
        const idMatch = urlString.match(/\/([a-f\d]{24})(\/|\?|$)/i);
        if (idMatch) {
          requestContext.leadId = idMatch[1];
        }
        const phoneMatch = urlString.match(/(?:phone|number|to|chatId|jid|waid|recipient)\/(\d{10,15})/i) || 
                           urlString.match(/[=\/](55\d{8,11})/);
        if (phoneMatch) {
          requestContext.leadPhone = phoneMatch[1];
        }
        // Extract pipelineId (UUID) from URL
        const pipelineMatch = urlString.match(/\/pipelines\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i);
        if (pipelineMatch) {
          requestContext.pipelineId = pipelineMatch[1];
        }
        // Extract companyId (UUID) from URL
        const companyMatch = urlString.match(/\/company\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i) ||
                             urlString.match(/\/companies\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i);
        if (companyMatch) {
          requestContext.companyId = companyMatch[1];
        }
      }

      const bodyArg = args[0];
      if (bodyArg) {
        let bodyObj = null;
        if (typeof bodyArg === 'string') {
          try {
            bodyObj = JSON.parse(bodyArg);
          } catch(e) {}
        }
        if (bodyObj) {
          const foundInfo = scanObjectForContactInfo(bodyObj);
          if (foundInfo) {
            requestContext = { ...requestContext, ...foundInfo };
          }
          const compInfo = scanObjectForCompanyInfo(bodyObj);
          if (compInfo) {
            requestContext = { ...requestContext, ...compInfo };
          }
          const autoInfo = scanObjectForAutomationInfo(bodyObj);
          if (autoInfo) {
            requestContext = { ...requestContext, ...autoInfo };
          }
        }
      }
    } catch(e) {}

    xhr.addEventListener('load', function() {
      if (this.__crazyStartTime) {
        const xhrDuration = Date.now() - this.__crazyStartTime;
        if (xhrDuration > 10000) {
          sendError('BUG_SLOW_API', {
            url: this.__crazyUrl || '',
            method: this.__crazyMethod || 'GET',
            durationMs: xhrDuration,
            durationSeconds: (xhrDuration / 1000).toFixed(1),
            status: this.status,
            message: `XHR demorou ${(xhrDuration / 1000).toFixed(1)} segundos para responder`,
            errorDetail: {
              errorCode: 'slow_api',
              errorMessage: `XHR para ${this.__crazyUrl || 'unknown'} levou ${(xhrDuration / 1000).toFixed(1)}s`
            }
          });
        }
      }

      const contentType = xhr.getResponseHeader('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      let parsedJson = null;
      const isTextResponse = xhr.responseType === '' || xhr.responseType === 'text';
      if (isJson && isTextResponse) {
        try {
          parsedJson = JSON.parse(xhr.responseText);
        } catch (e) {}
      } else if (xhr.responseType === 'json' && xhr.response) {
        parsedJson = xhr.response;
      }

      if (xhr.status >= 400) {
        const errorDetails = parsedJson ? scanJSONForErrors(parsedJson) : null;
        let compInfo = parsedJson ? (scanObjectForCompanyInfo(parsedJson) || {}) : {};
        if (xhr._url && (xhr._url.includes('/company') || xhr._url.includes('/companies'))) {
          if (parsedJson && typeof parsedJson === 'object') {
            compInfo.companyId = compInfo.companyId || parsedJson.id || parsedJson.uuid || parsedJson._id || null;
            compInfo.companyName = compInfo.companyName || parsedJson.name || parsedJson.title || null;
            if (parsedJson.cnpj || parsedJson.taxId || parsedJson.document || parsedJson.documento) {
              compInfo.companyTaxId = compInfo.companyTaxId || String(parsedJson.cnpj || parsedJson.taxId || parsedJson.document || parsedJson.documento).replace(/\D/g, '');
            }
          }
        }
        const autoInfo = parsedJson ? (scanObjectForAutomationInfo(parsedJson) || {}) : {};
        if (errorDetails && errorDetails.length > 0) {
          errorDetails.forEach(err => {
            sendError('API_HTTP_ERROR', {
              url: xhr._url,
              method: xhr._method,
              status: xhr.status,
              statusText: xhr.statusText,
              initiator: initiator,
              errorDetail: err,
              rawResponse: parsedJson || xhr.responseText,
              context: {
                ...xhr.__crazyRequestContext,
                ...compInfo,
                ...autoInfo,
                ...err.context
              }
            });
          });
        } else {
          sendError('API_HTTP_ERROR', {
            url: xhr._url,
            method: xhr._method,
            status: xhr.status,
            statusText: xhr.statusText,
            initiator: initiator,
            errorDetail: { errorCode: 'xhr_error_' + xhr.status, errorMessage: xhr.statusText || 'Erro no canal XHR' },
            rawResponse: parsedJson || xhr.responseText,
            context: {
              ...xhr.__crazyRequestContext,
              ...compInfo,
              ...autoInfo
            }
          });
        }
      } else if (parsedJson) {
        // Scan for active connections status monitoring
        detectConnections(parsedJson, xhr._url);

        let compInfo = scanObjectForCompanyInfo(parsedJson) || {};
        if (xhr._url && (xhr._url.includes('/company') || xhr._url.includes('/companies'))) {
          if (parsedJson && typeof parsedJson === 'object') {
            compInfo.companyId = compInfo.companyId || parsedJson.id || parsedJson.uuid || parsedJson._id || null;
            compInfo.companyName = compInfo.companyName || parsedJson.name || parsedJson.title || null;
            if (parsedJson.cnpj || parsedJson.taxId || parsedJson.document || parsedJson.documento) {
              compInfo.companyTaxId = compInfo.companyTaxId || String(parsedJson.cnpj || parsedJson.taxId || parsedJson.document || parsedJson.documento).replace(/\D/g, '');
            }
          }
        }
        const autoInfo = scanObjectForAutomationInfo(parsedJson) || {};

        // Success HTTP, but check for inner error arrays/fields
        const errorDetails = scanJSONForErrors(parsedJson);
        if (errorDetails) {
          errorDetails.forEach(err => {
            sendError('API_LOGICAL_ERROR', {
              url: xhr._url,
              method: xhr._method,
              status: xhr.status,
              statusText: xhr.statusText,
              initiator: initiator,
              errorDetail: err,
              rawResponse: parsedJson,
              context: {
                ...xhr.__crazyRequestContext,
                ...compInfo,
                ...autoInfo,
                ...err.context
              }
            });
          });
        }
      }
    });

    xhr.addEventListener('error', function() {
      if (!navigator.onLine) {
        sendError('NETWORK_OFFLINE_LOCAL', {
          url: xhr._url,
          method: xhr._method,
          status: 0,
          statusText: 'Offline',
          message: 'Conexão Desconectada - Sua internet local caiu.',
          errorDetail: { errorCode: 'offline', errorMessage: 'Sem internet local' },
          context: xhr.__crazyRequestContext
        });
      } else {
        sendError('API_NETWORK_ERROR', {
          url: xhr._url,
          method: xhr._method,
          status: 0,
          statusText: 'XHR Network Failure',
          initiator: initiator,
          errorDetail: { errorCode: 'xhr_failed', errorMessage: 'Requisição XHR falhou (bloqueio de rede ou CORS)' },
          context: xhr.__crazyRequestContext
        });
      }
    });

    xhr.__crazyRequestContext = {
      ...requestContext,
      ...scanObjectForContactInfo(args[0]),
      ...scanObjectForAutomationInfo(args[0]),
      url: xhr._url,
      pageUrl: window.location.href,
      timestamp: new Date().toISOString()
    };

    this.__crazyStartTime = Date.now();
    detectDoubleSubmit(xhr._url, xhr._method, args[0]);
    return originalSend.apply(this, args);
  };

  // ----------------- INTERCEPT WEBSOCKETS -----------------
  (function() {
    const OriginalWebSocket = window.WebSocket;
    if (!OriginalWebSocket) return;

    const WrappedWebSocket = function(url, protocols) {
      // Extract tenant/token from WebSocket URL
      try {
        const urlStr = String(url);
        const tokenMatch = urlStr.match(/[?&]token=([^&]+)/) || urlStr.match(/[?&]access_token=([^&]+)/);
        if (tokenMatch) {
          const tenantId = extractTenantIdFromJWT(tokenMatch[1]);
          if (tenantId) updateTenantId(tenantId);
        }
      } catch (e) {}

      let ws;
      try {
        if (protocols) {
          ws = new OriginalWebSocket(url, protocols);
        } else {
          ws = new OriginalWebSocket(url);
        }
      } catch (e) {
        sendError('WEBSOCKET_ERROR', {
          message: `Falha ao iniciar WebSocket: ${e.message}`,
          url: url,
          errorDetail: { errorCode: 'ws_init_failed', errorMessage: e.message }
        });
        throw e;
      }

      // Log physical close events
      ws.addEventListener('close', function(event) {
        if (event.code !== 1000 && event.code !== 1001) {
          sendError('UI_TOAST_ERROR', {
            message: `WebSocket desconectado (Código ${event.code})`,
            url: url,
            context: {
              companyId: lastDetectedTenantId,
              connectionStatus: 'Desconectado',
              connectionName: 'Linha de Mensagens',
              connectionProvider: 'WebSocket CRM'
            },
            errorDetail: {
              code: event.code,
              reason: event.reason || 'Conexão interrompida de forma abrupta',
              wasClean: event.wasClean
            }
          });
        }
      });

      // Log physical error events
      ws.addEventListener('error', function(event) {
        sendError('UI_TOAST_ERROR', {
          message: 'Falha de comunicação no WebSocket',
          url: url,
          context: {
            companyId: lastDetectedTenantId,
            connectionStatus: 'Inativo',
            connectionName: 'Linha de Mensagens',
            connectionProvider: 'WebSocket CRM'
          },
          errorDetail: { errorCode: 'websocket_network_error', errorMessage: 'Ocorreu um erro na conexão do socket.' }
        });
      });

      // Intercept incoming messages
      ws.addEventListener('message', function(event) {
        try {
          const rawData = event.data;
          if (typeof rawData !== 'string') return;

          // 1. Noise Filter: Ignore Socket.io heartbeats and simple control frames (e.g. "2", "3", "3probe")
          const trimmed = rawData.trim();
          if (trimmed === '2' || trimmed === '3' || trimmed === '3probe') return;

          // 2. Parse Socket.io format: engine.io packet type (e.g., "42") followed by json array
          let jsonStr = trimmed;
          const sioMatch = trimmed.match(/^(\d+)(.*)$/);
          if (sioMatch) {
            const packetType = sioMatch[1];
            if (packetType !== '42') return; 
            jsonStr = sioMatch[2].trim();
          }

          if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
            const parsed = JSON.parse(jsonStr);

            // Scan for active connections status monitoring
            detectConnections(parsed, url);

            // A. Detect connection updates pushed from backend
            if (Array.isArray(parsed) && parsed.length >= 2) {
              const eventName = String(parsed[0]);
              const eventData = parsed[1];
              
              if (eventData && typeof eventData === 'object' && (eventName.includes('connection') || eventName.includes('status') || eventName.includes('instance'))) {
                const status = eventData.state || eventData.status || eventData.connectionStatus || '';
                const instanceName = eventData.instance || eventData.name || eventData.phoneNumber || '';
                const provider = eventData.provider || eventData.type || '';
                
                const lowerStatus = status.toLowerCase();
                if (lowerStatus === 'close' || lowerStatus === 'disconnected' || lowerStatus === 'inativo' || lowerStatus === 'desconectado' || lowerStatus === 'connecting' || lowerStatus === 'pendente') {
                  sendError('UI_TOAST_ERROR', {
                    message: lowerStatus === 'connecting' || lowerStatus === 'pendente' ? 'Pendente' : 'Desconectado',
                    url: url,
                    context: {
                      companyId: lastDetectedTenantId,
                      connectionStatus: lowerStatus === 'connecting' || lowerStatus === 'pendente' ? 'Pendente' : 'Desconectado',
                      connectionName: instanceName || 'Canal Integrado',
                      connectionProvider: provider || 'Evolution/Gateway'
                    }
                  });
                }
              }
            }

            // B. Scan payload JSON recursively for logical errors
            const errors = scanJSONForErrors(parsed, 'ws');
            if (errors && errors.length > 0) {
              errors.forEach(err => {
                const compInfo = scanObjectForCompanyInfo(parsed) || {};
                const autoInfo = scanObjectForAutomationInfo(parsed) || {};
                sendError('API_LOGICAL_ERROR', {
                  url: url,
                  status: 200,
                  statusText: 'WebSocket Frame',
                  errorDetail: err,
                  context: {
                    companyId: lastDetectedTenantId,
                    ...compInfo,
                    ...autoInfo,
                    ...err.context
                  }
                });
              });
            }
          }
        } catch (e) {}
      });

      return ws;
    };

    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    for (const key in OriginalWebSocket) {
      if (Object.prototype.hasOwnProperty.call(OriginalWebSocket, key)) {
        WrappedWebSocket[key] = OriginalWebSocket[key];
      }
    }
    window.WebSocket = WrappedWebSocket;
  })();

  // ----------------- NOISE FILTER FOR CONSOLE & EXCEPTIONS -----------------
  function shouldIgnore(message) {
    if (!message) return true;
    const msgStr = String(message);
    const IGNORE_PATTERNS = [
      /extension context invalidated/i,
      /missing_message/i,
      /dialogcontent/i,
      /dialogtitle/i,
      /visuallyhidden/i,
      /aria-describedby/i,
      /react-intl/i,
      /formatjs/i,
      /react\.development/i,
      /react-dom\.development/i,
      /scheduler\.development/i,
      /invalid time value/i,
      /formatting_error/i,
      /webpack-internal/i,
      /hot-update/i,
      /hmr/i,
      /content script/i,
      /inject-scripts/i,
      /react-devtools/i,
      /missing\s+['"]?description/i,
      /radix-ui/i,
      /mcp\.tools\./i
    ];
    return IGNORE_PATTERNS.some(pattern => pattern.test(msgStr));
  }

  function formatConsoleArgs(args) {
    return args.map(arg => {
      if (arg instanceof Error) {
        return arg.stack || arg.message || String(arg);
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return `[Circular or Non-serializable Object: ${arg.constructor ? arg.constructor.name : 'Object'}]`;
        }
      }
      return String(arg);
    }).join(' ');
  }

  // ----------------- INTERCEPT CONSOLE ERRORS -----------------
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    const message = formatConsoleArgs(args);
    if (shouldIgnore(message)) return;

    const stack = new Error().stack;
    const initiator = parseStack(stack);
    sendError('CONSOLE_ERROR', {
      message: message,
      initiator: initiator,
      cleanStack: cleanStackTrace(stack)
    });
  };

  console.warn = function(...args) {
    originalConsoleWarn.apply(console, args);
    const message = formatConsoleArgs(args);
    if (shouldIgnore(message)) return;

    const stack = new Error().stack;
    const initiator = parseStack(stack);
    sendError('CONSOLE_WARN', {
      message: message,
      initiator: initiator,
      cleanStack: cleanStackTrace(stack)
    });
  };

  // ----------------- INTERCEPT RUNTIME CRASHES -----------------
  window.addEventListener('error', function(event) {
    const message = event.message || '';
    if (shouldIgnore(message)) return;

    const stack = event.error ? event.error.stack : '';
    const initiator = event.error ? parseStack(stack) : {
      caller: 'global',
      url: event.filename,
      fileName: event.filename ? event.filename.split('/').pop() : 'script',
      line: event.lineno,
      column: event.colno,
      rawLine: `${event.filename}:${event.lineno}`
    };

    sendError('RUNTIME_EXCEPTION', {
      message: message,
      fileName: event.filename,
      line: event.lineno,
      column: event.colno,
      initiator: initiator,
      cleanStack: cleanStackTrace(stack)
    });
  });

  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    let message = 'Promise rejeitada';
    let stack = null;

    if (reason) {
      if (typeof reason === 'string') {
        message = reason;
      } else if (typeof reason === 'object') {
        message = reason.message || JSON.stringify(reason);
        stack = reason.stack;
      }
    }

    if (shouldIgnore(message)) return;

    const useStack = stack || new Error().stack;
    const initiator = parseStack(useStack);

    sendError('UNHANDLED_PROMISE_REJECTION', {
      message: message,
      initiator: initiator,
      rawReason: reason ? String(reason) : null,
      cleanStack: cleanStackTrace(useStack)
    });
  });

  // Expose internals for testing
  window.__CrazyDiagnosticsDebug = {
    scanJSONForErrors,
    scanObjectForContactInfo,
    scanObjectForCompanyInfo,
    scanObjectForAutomationInfo
  };

  // Schedule a startup fetch of connections in case the token is already in storage
  if (typeof setTimeout !== 'undefined') {
    setTimeout(fetchConnectionsInvisibly, 1000);
  }

  console.log('CrazyDiagnostics: Interceptadores injetados e ativos no DataCrazy.');
})();
