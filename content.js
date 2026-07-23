(function() {
  console.log('CrazyDiagnostics: Script de conteúdo ativo.');

  // Clear connections and logs cache on reload (safest place, avoids race conditions)
  try {
    chrome.runtime.sendMessage({
      source: 'CRAZY_DIAGNOSTICS_CONTENT',
      type: 'CLEAR_TAB_CACHE'
    });
  } catch (e) {}

  const handshakeToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  try {
    document.documentElement.setAttribute('data-crazy-token', handshakeToken);
  } catch(e) {}

  // 1. Inject the page script into the main execution context
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.setAttribute('data-token', handshakeToken);
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.error('CrazyDiagnostics: Erro ao injetar script:', e);
  }

  let clickedContext = {
    leadId: null,
    leadName: null,
    leadPhone: null,
    cardName: null,
    automationName: null,
    blockName: null,
    blockId: null,
    blockError: null,
    connectionName: null,
    connectionProvider: null,
    dashboardWidget: null,
    pipelineName: null,
    pipelineId: null,
    dealName: null,
    dealId: null,
    companyId: null,
    companyName: null,
    companyTaxId: null
  };

  let lastHref = window.location.href;
  let lastCompanyKey = null;
  let contextResetTimer = null;

  setInterval(() => {
    // 1. Check if URL changed
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      resetClickedContext();
    }

    // 2. Check if company context changed
    const currentCtx = getPageContext();
    const currentCompanyKey = JSON.stringify({id: currentCtx.companyId || null, name: currentCtx.companyName || null, tax: currentCtx.companyTaxId || null});

    const hasCompanyData = currentCtx.companyId || currentCtx.companyName || currentCtx.companyTaxId;
    if (hasCompanyData) {
      if (currentCompanyKey !== lastCompanyKey) {
        // Company changed! Clear active logs and connections in background script
        chrome.runtime.sendMessage({
          source: 'CRAZY_DIAGNOSTICS_CONTENT',
          type: 'COMPANY_CHANGED',
          timestamp: new Date().toISOString(),
          data: {
            previousCompany: lastCompanyKey || null,
            newCompany: currentCompanyKey
          }
        });
      }
      lastCompanyKey = currentCompanyKey;
    }
    // 3. Periodic DOM warning scanner (every 3 seconds / 3 ticks)
    if (typeof scanCounter === 'undefined') {
      window.__CD_scanCounter = 0;
    }
    window.__CD_scanCounter++;
    if (window.__CD_scanCounter >= 3) {
      window.__CD_scanCounter = 0;
      scanDOMForErrors();
    }
  }, 1000);

  function scanDOMForErrors() {
    try {
      const candidates = document.querySelectorAll('div, span, p, label, a, [role="alert"]');
      candidates.forEach(function(candidate) {
        if (candidate.hasAttribute('data-crazy-scanned')) return;
        // Only inspect leaf-like elements or elements with short text to avoid performance lag
        if (candidate.children && candidate.children.length > 1) return;
        
        // Skip elements that are not visible to the user
        if (candidate.hidden || (candidate.style && candidate.style.display === 'none')) return;

        const textVal = (candidate.textContent || '').trim();
        if (textVal.length > 3 && textVal.length < 300) {
          const lowerText = textVal.toLowerCase();
          
          // 1. General Color-based scanner
          const hasKeyword = candidateKeywords.some(kw => lowerText.includes(kw));
          if (hasKeyword) {
            const colorType = isWarningOrErrorColor(candidate);
            if (colorType) {
              reportToast(candidate.innerText || textVal, candidate.className || '', candidate);
              candidate.setAttribute('data-crazy-scanned', '1');
              return;
            }
          }

          // 2. Keyword-only CRM warnings fallback (e.g. 24h conversation limit)
          const isCRMWarningText = 
            lowerText.includes('24 horas') || 
            lowerText.includes('não suportad') ||
            lowerText.includes('unsupported') ||
            lowerText.includes('template');
          if (isCRMWarningText) {
            reportToast(candidate.innerText || textVal, candidate.className || '', candidate);
            candidate.setAttribute('data-crazy-scanned', '1');
          }
        }
      });
    } catch (e) {
      console.warn('CrazyDiagnostics: Erro na varredura periódica de erros:', e);
    }
  }

  // Immediate first scan on page load
  try { scanDOMForErrors(); } catch(e) {}
  // Reinforcement scan 2 seconds later to catch React-rendered content
  setTimeout(() => { try { scanDOMForErrors(); } catch(e) {} }, 2000);

  function resetClickedContext() {
    clickedContext = {
      leadId: null,
      leadName: null,
      leadPhone: null,
      cardName: null,
      automationName: null,
      blockName: null,
      blockId: null,
      blockError: null,
      connectionName: null,
      connectionProvider: null,
      dashboardWidget: null,
      pipelineName: null,
      pipelineId: null,
      dealName: null,
      dealId: null,
      companyId: null,
      companyName: null,
      companyTaxId: null
    };
  }

  // Scrape from lead name blocklist
  const leadNameBlocklist = [
    'visualização', 'negócios', 'plano', 'pro', 'business', 'enterprise', 'free',
    'empresa', 'configuraç', 'dashboard', 'painel', 'relatório', 'sair',
    'desconectado', 'conectado', 'carregando', 'criar lead', 'atribuir', 'encontrado',
    'iniciado', 'pesquisa', 'buscar', 'contatos', 'conversas', 'ajustes', 'perfil', 
    'suporte', 'integração', 'notificaç', 'chat ao vivo', 'multiservice', 'atendimento',
    'mensagem', 'mensagens', 'config', 'admin', 'geral', 'simulador'
  ];

  // Fast-path keywords to filter out irrelevant DOM nodes before expensive style checks
  const candidateKeywords = [
    'erro', 'falha', 'inválid', 'error', 'failed', 'locked', 'bloqueado', 'desabilitad',
    'restringid', 'incorrect', 'incorret', 'problema', 'cannot', 'desconectado',
    'suspenso', 'unsupported', 'não suportad',
    '24 horas', 'template', 'warning', 'danger', 'alert'
  ];


  document.addEventListener('mousedown', function(e) {
    const target = e.target;
    if (!target) return;

    let current = target;
    let foundAnyContext = false;

    // Traverse up to 6 levels to find parent context
    for (let i = 0; i < 6; i++) {
      if (!current || current === document.body) break;

      const classStr = String(current.className || '').toLowerCase();
      const idStr = String(current.id || '').toLowerCase();
      const text = (current.innerText || current.textContent || '').trim();

      // 1. Dashboard Widget/Metric Card Click (Image 1)
      if (classStr.includes('metric') || classStr.includes('widget') || classStr.includes('card') || current.getAttribute('data-widget')) {
        const titleEl = current.querySelector('h1, h2, h3, h4, span, [class*="title"], [class*="label"]');
        if (titleEl) {
          const t = titleEl.textContent.trim();
          if (t && t.length > 2 && t.length < 50 && (t.includes('Total') || t.includes('ganhos') || t.includes('perdidos') || t.includes('aberto') || t.includes('diários') || t.includes('Percentual'))) {
            resetClickedContext();
            clickedContext.dashboardWidget = t;
            foundAnyContext = true;
            break;
          }
        }
      }

      // 2. Kanban Card Click (Image 2)
      if (classStr.includes('kanban-card') || classStr.includes('card') || current.getAttribute('data-card-id')) {
        const nameEl = current.querySelector('[class*="name"], [class*="title"], strong');
        const textLines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const cardTitle = nameEl ? nameEl.textContent.trim() : (textLines[0] || '');
        if (cardTitle && cardTitle.length > 2 && cardTitle.length < 50 && !leadNameBlocklist.some(term => cardTitle.toLowerCase().includes(term))) {
          resetClickedContext();
          clickedContext.cardName = cardTitle;
          const hashMatch = text.match(/#(\d+)/);
          if (hashMatch) {
            clickedContext.leadId = hashMatch[0]; // e.g. #9
          }
          foundAnyContext = true;
          break;
        }
      }

      // 3. Pipeline Sidebar Item Click (Image 2)
      if (classStr.includes('pipeline') || classStr.includes('funil') || current.getAttribute('data-pipeline') || classStr.includes('board-list')) {
        const nameText = text.split('\n')[0].trim();
        if (nameText && nameText.length > 2 && nameText.length < 50 && !nameText.includes('Nova pipeline')) {
          resetClickedContext();
          clickedContext.pipelineName = nameText;
          foundAnyContext = true;
          break;
        }
      }

      // 4. Automation Block Node Click (Image 4)
      if (classStr.includes('node') || classStr.includes('block') || current.getAttribute('data-node-id') || classStr.includes('step') || classStr.includes('react-flow__node')) {
        const titleEl = current.querySelector('[class*="title"], [class*="name"], h3, h4, strong');
        const blockTitle = titleEl ? titleEl.textContent.trim() : text.split('\n')[0].trim();
        if (blockTitle && blockTitle.length > 2 && blockTitle.length < 50 && !leadNameBlocklist.some(term => blockTitle.toLowerCase().includes(term))) {
          resetClickedContext();
          clickedContext.blockName = blockTitle;
          clickedContext.blockId = current.getAttribute('data-id') || current.getAttribute('data-node-id');
          foundAnyContext = true;
          break;
        }
      }

      // 5. Deal Click in right sidebar (Image 5)
      if (text.toLowerCase().includes('negócio #') || text.toLowerCase().includes('negocio #') || classStr.includes('deal')) {
        const match = text.match(/negócio\s*(#\d+)/i) || text.match(/negocio\s*(#\d+)/i);
        if (match) {
          resetClickedContext();
          clickedContext.dealName = match[0];
          clickedContext.dealId = match[1];
          foundAnyContext = true;
          break;
        }
      }

      // 6. Lead row in table Click (Image 3) or Chat list item Click (Image 5)
      if (current.tagName === 'TR' || classStr.includes('row') || classStr.includes('item') || classStr.includes('chat-list-item')) {
        const nameEl = current.querySelector('[class*="name"], strong, a');
        if (nameEl) {
          const n = nameEl.textContent.trim();
          if (n && n.length > 2 && n.length < 50 && !leadNameBlocklist.some(term => n.toLowerCase().includes(term))) {
            resetClickedContext();
            clickedContext.leadName = n;
            const phoneMatch = text.match(/\+?\d{10,15}/);
            if (phoneMatch) {
              clickedContext.leadPhone = phoneMatch[0].replace(/\D/g, '');
            }
            foundAnyContext = true;
            break;
          }
        }
      }

      // 7. Connection Settings Click (e.g. MCP fields)
      if (classStr.includes('connection') || classStr.includes('channel') || classStr.includes('config') || idStr.includes('connection')) {
        const titleEl = current.querySelector('h1, h2, h3, h4, span, strong, [class*="title"]');
        if (titleEl) {
          const t = titleEl.textContent.trim();
          if (t && t.length > 2 && t.length < 50 && !leadNameBlocklist.some(term => t.toLowerCase().includes(term))) {
            resetClickedContext();
            clickedContext.connectionName = t;
            foundAnyContext = true;
            break;
          }
        }
      }

      current = current.parentElement;
    }

    // If they click on a background element/empty area (not part of any context), reset the click context
    if (foundAnyContext) {
      if (contextResetTimer) {
        clearTimeout(contextResetTimer);
        contextResetTimer = null;
      }
    } else {
      const isButtonOrInput = target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'A';
      if (!isButtonOrInput) {
        if (!contextResetTimer) {
          contextResetTimer = setTimeout(() => {
            resetClickedContext();
            contextResetTimer = null;
          }, 15000);
        }
      }
    }
  });

  // Helper to scrape the active context (automation name, active card, lead name/id) from DOM
  function getPageContext() {
    const ctx = {
      automationName: null,
      cardName: null,
      leadName: null,
      leadId: null,
      leadPhone: null,
      blockName: null,
      blockId: null,
      blockError: null,
      connectionName: null,
      connectionProvider: null,
      dashboardWidget: null,
      pipelineName: null,
      pipelineId: null,
      dealName: null,
      dealId: null,
      companyId: null,
      companyName: null,
      companyTaxId: null
    };

    try {
      const url = window.location.href;

      // A. Extract MongoDB 24-char Hex ID from URL path (DataCrazy uses ObjectId for leads and cards)
      const idMatch = url.match(/\/([a-f\d]{24})(\/|\?|$)/i);
      if (idMatch) {
        ctx.leadId = idMatch[1];
      }

      // Extract phone number from URL path (e.g., /multiservice/5511987654321)
      const phoneInUrl = url.match(/\/(\d{10,15})(\/|\?|$)/);
      if (phoneInUrl) {
        ctx.leadPhone = phoneInUrl[1];
      }

      // Extract pipelineId (UUID) from URL path
      const pipelineMatch = url.match(/\/pipelines\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i);
      if (pipelineMatch) {
        ctx.pipelineId = pipelineMatch[1];
      }

      // Scrape chat panel header using structural selectors when a chat is open (message input is present)
      const msgInput = document.querySelector('textarea[name="message"]');
      if (msgInput) {
        const chatPanel = msgInput.closest('.h-full') || msgInput.parentElement?.closest('div');
        if (chatPanel) {
          let scrapedName = null;
          let scrapedPhone = null;
          let scrapedId = null;

          // 1. Tentar seletores estruturais diretos no painel de chat ou documento
          const structuralNameSelectors = ['.profile-header', '.active-chat-name', '.chat-header-name', '.chat-contact-name'];
          for (const selector of structuralNameSelectors) {
            const el = chatPanel.querySelector(selector) || document.querySelector(selector);
            if (el) {
              const text = (el.innerText || el.textContent || '').trim();
              if (text && !text.includes('\n')) {
                const cleanName = text.replace(/^[\u{1F300}-\u{1F9FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{1F500}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]\s*/u, '').trim();
                if (cleanName.length > 2 && cleanName.length < 50 && !leadNameBlocklist.some(term => cleanName.toLowerCase().includes(term))) {
                  scrapedName = cleanName;
                  break;
                }
              }
            }
          }

          // 2. Se não achou nome, buscar o primeiro h2/h3 dentro de uma barra lateral (aside ou class*="sidebar") ou no chatPanel
          if (!scrapedName) {
            const sidebar = document.querySelector('aside') || document.querySelector('[class*="sidebar"]') || document.querySelector('[class*="aside"]');
            const targetHeader = (sidebar ? sidebar.querySelector('h2, h3') : null) || chatPanel.querySelector('h2, h3, h1, h4');
            if (targetHeader) {
              const text = (targetHeader.innerText || targetHeader.textContent || '').trim();
              if (text && !text.includes('\n')) {
                const cleanName = text.replace(/^[\u{1F300}-\u{1F9FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{1F500}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]\s*/u, '').trim();
                if (cleanName.length > 2 && cleanName.length < 50 && !leadNameBlocklist.some(term => cleanName.toLowerCase().includes(term))) {
                  scrapedName = cleanName;
                }
              }
            }
          }

          // 3. Buscar telefone e ID nos primeiros elementos de texto folha do chatPanel
          const textElements = chatPanel.querySelectorAll('h1, h2, h3, h4, span, strong, div');
          let textCount = 0;
          for (const el of textElements) {
            if (el.children.length > 0) continue; // Apenas nós folha
            const text = (el.innerText || el.textContent || '').trim();
            if (!text || text.includes('\n')) continue;
            
            textCount++;
            if (textCount > 15) break; // Evita percorrer o histórico de mensagens inteiro

            // Parse ID
            const hashMatch = text.match(/#(\d+)/);
            if (hashMatch && !scrapedId) {
              scrapedId = hashMatch[0];
            }

            // Parse Phone
            const cleanPhone = text.replace(/\D/g, '');
            if (cleanPhone.length >= 8 && cleanPhone.length <= 15 && /^\+?\d+$/.test(text.replace(/[-\s()]/g, ''))) {
              if (!scrapedPhone) scrapedPhone = cleanPhone;
            }
          }

          if (scrapedName) ctx.leadName = scrapedName;
          if (scrapedPhone) ctx.leadPhone = scrapedPhone;
          if (scrapedId) ctx.leadId = scrapedId;
        }
      }


      // B. Scrape active automation name from CRM DOM (e.g. left sidebar or central board view)
      const activeEl = document.querySelector('[class*="-active"], [class*="active"], [class*="selected"], [class*="current"]');
      if (activeEl) {
        const text = activeEl.innerText || activeEl.textContent || '';
        if (text && text.trim().length < 50 && !text.includes('\n')) {
          ctx.automationName = text.trim();
        }
      }

      // If we are on the automation flow builder page
      if (url.includes('automation') || url.includes('fluxo')) {
        const activeNavEl = document.querySelector('aside [class*="active"], [class*="sidebar"] [class*="active"], [class*="menu"] [class*="active"]');
        if (activeNavEl) {
          const text = activeNavEl.innerText || activeNavEl.textContent || '';
          if (text && text.trim().length < 50 && !text.includes('\n')) {
            ctx.automationName = text.trim();
          }
        }
      }

      // C. Scrape Lead Name and Stage Name (Card/Board context)
      const nameSelectors = [
        // 1. Direct active/selected chat details (specific classes)
        '.active-chat-name',
        '.chat-header-name',
        '.chat-contact-name',
        '.conversation-header .name',
        
        // 2. Class names containing both chat/contact/lead and name/title
        '[class*="chat-header"] [class*="name"]',
        '[class*="chatHeader"] [class*="name"]',
        '[class*="active-chat"] [class*="name"]',
        '[class*="activeChat"] [class*="name"]',
        '[class*="conversation-header"] [class*="name"]',
        '[class*="active-conversation"] [class*="name"]',
        
        // 3. Selected chat/contact item in lists
        '[class*="chat-item"][class*="active"] [class*="name"]',
        '[class*="chat-item"][class*="selected"] [class*="name"]',
        '[class*="chat-list-item"][class*="active"] [class*="name"]',
        '[class*="chat-list-item"][class*="selected"] [class*="name"]',
        '[class*="contact-item"][class*="active"] [class*="name"]',
        '[class*="contact-item"][class*="selected"] [class*="name"]',
        '[class*="conversation-item"][class*="active"] [class*="name"]',
        '[class*="conversation-item"][class*="selected"] [class*="name"]',
        '[class*="active"] [class*="chat-name"]',
        '[class*="active"] [class*="contact-name"]',
        
        // 4. Specific lead page headers
        '.lead-title',
        '.lead-name',
        'h1[class*="lead"]',
        'h2[class*="lead"]',
        'h3[class*="lead"]',
        'h1[class*="chat"]',
        'h2[class*="chat"]',
        'h3[class*="chat"]',
        '[class*="profile"] [class*="name"]',
        '[class*="contact"] [class*="name"]',
        '[class*="lead"] [class*="name"]'
      ];

      if (!ctx.leadName) {
        for (const selector of nameSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            let text = el.innerText || el.textContent || '';
            text = text.trim().split('\n')[0].trim();
            if (text && text.length > 2 && text.length < 50) {
              const lowerText = text.toLowerCase();
              const isBlacklisted = leadNameBlocklist.some(term => lowerText.includes(term));
              if (!isBlacklisted) {
                // Clean up leading emojis and icons (e.g. 👤 João -> João)
                ctx.leadName = text.replace(/^[\u{1F300}-\u{1F9FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{1F500}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]\s*/u, '');
                break;
              }
            }
          }
        }
      }

      // Scrape Lead Phone
      const phoneSelectors = [
        'a[href^="tel:"]',
        'a[href*="wa.me/"]',
        'a[href*="api.whatsapp.com/send"]',
        '[class*="contact-number"]',
        '[class*="contactNumber"]',
        '[class*="phone"]',
        '[class*="telefone"]',
        '[id*="phone"]',
        '[class*="whatsapp"]',
        '[class*="contact-phone"]',
        '[class*="contactPhone"]',
        '[class*="phoneNumber"]',
        '[class*="phone-number"]',
        '[class*="number"]'
      ];
      
      if (!ctx.leadPhone) {
        for (const sel of phoneSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            let phoneText = '';
            if (el.tagName === 'A' && el.getAttribute('href')) {
              const href = el.getAttribute('href');
              const phoneMatch = href.match(/(tel:|wa\.me\/|send\?phone=)(\+?\d+)/);
              if (phoneMatch) phoneText = phoneMatch[2];
            } else {
              phoneText = el.innerText || el.textContent || '';
            }
            
            // Match standard phone patterns (DDI optional, 8 to 15 digits)
            const match = phoneText.match(/\+?\d{2,4}\s?\(?\d{2,3}\)?\s?9?\d{4}[-\s]?\d{4}/) || phoneText.match(/\d{8,15}/);
            if (match) {
              ctx.leadPhone = match[0].replace(/\D/g, '');
              break;
            }
          }
        }
      }

      // If the scraped leadName is actually a phone number, copy it to leadPhone and clear leadName
      if (ctx.leadName) {
        const cleanPhone = ctx.leadName.replace(/\D/g, '');
        if (cleanPhone.length >= 8 && cleanPhone.length <= 15 && /^\+?\d+$/.test(ctx.leadName.replace(/[-\s()]/g, ''))) {
          ctx.leadPhone = cleanPhone;
          ctx.leadName = null;
        }
      }

      // Fallback 1: Extract Lead Name from Document Title (browser tab title)
      if (!ctx.leadName && document.title) {
        const titleText = document.title;
        const parts = titleText.split(/[-|•]/);
        if (parts.length > 1) {
          const possibleName = parts[0].trim();
          const cleanName = possibleName.replace(/^👤\s*/, '');
          if (
            cleanName.length > 2 && 
            cleanName.length < 50 && 
            !leadNameBlocklist.some(term => cleanName.toLowerCase().includes(term))
          ) {
            ctx.leadName = cleanName;
          }
        }
      }

      // Fallback 2: Generic DOM scanner for profile pane inputs/labels
      if (!ctx.leadName || !ctx.leadPhone) {
        try {
          const allElements = document.querySelectorAll('div, span, label, p');
          for (const el of allElements) {
            const labelText = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (!ctx.leadName && (labelText === 'nome' || labelText === 'nome do lead' || labelText === 'cliente')) {
              let valueEl = el.nextElementSibling || el.parentElement?.querySelector('input, span, strong');
              if (valueEl) {
                const val = (valueEl.value || valueEl.innerText || valueEl.textContent || '').trim();
                if (val && val.length > 2 && val.length < 50 && !leadNameBlocklist.some(term => val.toLowerCase().includes(term))) {
                  ctx.leadName = val;
                }
              }
            }
            if (!ctx.leadPhone && (labelText === 'telefone' || labelText === 'celular' || labelText === 'whatsapp')) {
              let valueEl = el.nextElementSibling || el.parentElement?.querySelector('input, span, strong');
              if (valueEl) {
                const val = (valueEl.value || valueEl.innerText || valueEl.textContent || '').trim();
                const cleanPhone = val.replace(/\D/g, '');
                if (cleanPhone.length >= 8 && cleanPhone.length <= 15) {
                  ctx.leadPhone = cleanPhone;
                }
              }
            }
          }
        } catch(err) {}
      }

      const activeCard = document.querySelector('.kanban-card[class*="active"], [class*="card-active"], [class*="card"][class*="selected"]');
      if (activeCard) {
        const text = activeCard.innerText || activeCard.textContent || '';
        if (text && text.trim().length < 50) {
          ctx.cardName = text.trim().split('\n')[0]; // First line only
        }
      }

      // D. Automation Block Node scraping
      if (url.includes('automation') || url.includes('fluxo')) {
        const activeNode = document.querySelector('[class*="node-selected"], [class*="active-node"], [class*="node"][class*="active"], [class*="block"][class*="selected"], .react-flow__node.selected');
        if (activeNode) {
          const titleEl = activeNode.querySelector('[class*="title"], [class*="name"], h3, h4, strong');
          ctx.blockName = titleEl ? (titleEl.innerText || titleEl.textContent || '') : activeNode.innerText.split('\n')[0];
          ctx.blockId = activeNode.getAttribute('data-id') || activeNode.getAttribute('data-node-id');
        }

        // Secondary scraping: logs drawer title
        let drawerTitle = '';
        const allHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div');
        for (const el of allHeaders) {
          const textVal = (el.innerText || el.textContent || '').trim();
          if (textVal.includes('Logs do bloco ⚡')) {
            drawerTitle = textVal;
            break;
          }
        }
        if (drawerTitle) {
          const namePart = drawerTitle.replace('Logs do bloco ⚡', '').trim();
          if (namePart) {
            ctx.blockName = namePart;
          }
        }

        const errorNode = document.querySelector('[class*="node-error"], [class*="error-node"], [class*="node"][class*="invalid"], [class*="node-danger"]');
        if (errorNode) {
          const titleEl = errorNode.querySelector('[class*="title"], [class*="name"], h3, h4');
          if (titleEl) {
            ctx.blockName = ctx.blockName || (titleEl.innerText || titleEl.textContent || '');
          }
          if (!ctx.blockId) {
            ctx.blockId = errorNode.getAttribute('data-id') || errorNode.getAttribute('data-node-id');
          }
          const errorMsgEl = errorNode.querySelector('[class*="error-msg"], [class*="message"], [class*="warning"]');
          if (errorMsgEl) {
            ctx.blockError = errorMsgEl.innerText || errorMsgEl.textContent || '';
          }
        }
      }

      // E. Connection/Channel/Integration context static scraping
      if (url.includes('connections') || url.includes('conexoes') || url.includes('settings') || url.includes('config') || url.includes('integra')) {
        const activeConnEl = document.querySelector('[class*="card"][class*="active"], [class*="card"][class*="selected"], [class*="item"][class*="active"], [class*="item"][class*="selected"], [class*="tab"][class*="active"]');
        if (activeConnEl) {
          const text = (activeConnEl.innerText || activeConnEl.textContent || '').trim().split('\n')[0];
          if (text && text.length > 2 && text.length < 50 && !leadNameBlocklist.some(term => text.toLowerCase().includes(term))) {
            ctx.connectionName = text;
          }
        }
        
        const headerEl = document.querySelector('h1, h2, h3, [class*="title"], [class*="header"]');
        if (headerEl && !ctx.connectionName) {
          const text = (headerEl.textContent || '').trim().split('\n')[0];
          if (text && text.length > 2 && text.length < 50 && !leadNameBlocklist.some(term => text.toLowerCase().includes(term))) {
            ctx.connectionName = text;
          }
        }
      }

      // F. Company context scraping
      if (url.includes('/config/company') || url.includes('/empresa') || url.includes('/billing') || url.includes('/financeiro') || url.includes('/config')) {
        // Find inputs by placeholder or labels
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          const nameAttr = (input.name || '').toLowerCase();
          const placeholderAttr = (input.placeholder || '').toLowerCase();
          const idAttr = (input.id || '').toLowerCase();
          const value = (input.value || '').trim();
          
          if (!ctx.companyName && (nameAttr === 'companyname' || nameAttr === 'name' || placeholderAttr.includes('nome da empresa') || placeholderAttr.includes('razão social') || idAttr.includes('companyname') || idAttr === 'name')) {
            if (value && value.length > 2 && value.length < 100) {
              ctx.companyName = value;
            }
          }
          if (!ctx.companyTaxId && (nameAttr.includes('cnpj') || nameAttr.includes('taxid') || nameAttr.includes('documento') || placeholderAttr.includes('cnpj') || placeholderAttr.includes('document') || idAttr.includes('cnpj') || idAttr.includes('taxid'))) {
            if (value && value.length >= 11) {
              ctx.companyTaxId = value.replace(/\D/g, ''); // Extract only digits
            }
          }
        }
        
        // Also look at h1 or h2 for header company name
        if (!ctx.companyName) {
          const headerEl = document.querySelector('h1, h2, .company-header-title');
          if (headerEl) {
            const hText = headerEl.textContent.trim();
            if (hText && hText.length > 2 && hText.length < 50 && !leadNameBlocklist.some(term => hText.toLowerCase().includes(term))) {
              ctx.companyName = hText;
            }
          }
        }
      }

      // Check URL for company uuid
      const companyUuidMatch = url.match(/\/company\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i) ||
                               url.match(/\/companies\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/i);
      if (companyUuidMatch) {
        ctx.companyId = companyUuidMatch[1];
      }

      // Local storage fallback for active company
      try {
        const companyKeys = ['company', 'activeCompany', 'currentCompany', 'tenant', 'user'];
        let compId = null;
        let compName = null;
        let compTaxId = null;

        for (const storageKey of companyKeys) {
          const storedStr = localStorage.getItem(storageKey);
          if (storedStr) {
            try {
              const obj = JSON.parse(storedStr);
              if (obj && typeof obj === 'object') {
                compId = compId || obj.companyId || obj.company_id || obj.id || (obj.uuid ? obj.uuid : null);
                compName = compName || obj.companyName || obj.company_name || obj.name || obj.title || null;
                compTaxId = compTaxId || obj.companyTaxId || obj.taxId || obj.cnpj || obj.document || obj.documento || null;
              } else if (storedStr && typeof storedStr === 'string' && storedStr.trim().length > 5) {
                // If it's a simple string representing ID (like a UUID)
                const val = storedStr.trim();
                if (storageKey !== 'user' && !val.includes('{') && !val.includes('[')) {
                  compId = compId || val;
                }
              }
            } catch (e) {
              // If JSON parsing fails but it's a valid string ID
              const val = storedStr.trim();
              if (storageKey !== 'user' && val && val.length > 5 && !val.includes('{') && !val.includes('[')) {
                compId = compId || val;
              }
            }
          }
        }

        ctx.companyId = ctx.companyId || compId;
        ctx.companyName = ctx.companyName || compName;
        ctx.companyTaxId = ctx.companyTaxId || compTaxId;
      } catch (e) {}

      // Helper to identify if an element belongs to a chat history, list, or message bubble
      function isChatOrMessageElement(el) {
        let parent = el;
        while (parent) {
          if (parent.classList) {
            for (let i = 0; i < parent.classList.length; i++) {
              const cls = parent.classList[i].toLowerCase();
              if (
                cls.includes('message') ||
                cls.includes('bubble') ||
                cls.includes('chat-log') ||
                cls.includes('chat-history') ||
                cls.includes('chat-list') ||
                cls.includes('chat-item') ||
                cls.includes('conversation-list') ||
                cls.includes('conversation-item') ||
                cls.includes('msg-') ||
                cls.includes('feed-') ||
                cls.includes('timeline')
              ) {
                return true;
              }
            }
          }
          const id = (parent.id || '').toLowerCase();
          if (id.includes('chat') || id.includes('message') || id.includes('conversation')) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }

      // G. Scrape company name globally from header dropdown (if visible)
      if (!ctx.companyName) {
        const allElements = document.querySelectorAll('button, div, span, h1, h2, h3');
        for (const el of allElements) {
          if (isChatOrMessageElement(el)) continue;
          const text = (el.innerText || '').trim();
          if (text && text.includes('\n') && text.length > 5 && text.length < 150) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 2 && lines.length <= 6) {
              const possibleCompany = lines[1];
              if (possibleCompany && possibleCompany.length > 2 && possibleCompany.length < 50 && !leadNameBlocklist.some(term => possibleCompany.toLowerCase().includes(term)) && !possibleCompany.includes(':') && !possibleCompany.includes('/') && !possibleCompany.startsWith('#')) {
                ctx.companyName = possibleCompany;
                break;
              }
            }
          }
        }
      }

      // H. Heuristic: Scrape lead name from the chat header dropdown if company name is known
      if (!ctx.leadName && ctx.companyName) {
        const allElements = document.querySelectorAll('button, div, span, h1, h2, h3');
        for (const el of allElements) {
          if (isChatOrMessageElement(el)) continue;
          const text = (el.innerText || '').trim();
          if (text.includes(ctx.companyName) && text.length > ctx.companyName.length + 2 && text.length < 100) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 2 && lines.length <= 6) {
              const possibleName = lines[0];
              if (possibleName && possibleName !== ctx.companyName && !leadNameBlocklist.some(term => possibleName.toLowerCase().includes(term))) {
                ctx.leadName = possibleName.replace(/^[\u{1F300}-\u{1F9FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{1F500}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]\s*/u, '').trim();
                break;
              }
            }
          }
        }
      }

      // I. Inspect React Fiber on active elements (if accessible, or via duplicate logic since content script might be isolated)
      try {
        const activeEls = [
          document.activeElement,
          document.querySelector('[class*="active"], [class*="selected"], [class*="current"]')
        ].filter(Boolean);
        
        for (const el of activeEls) {
          let current = el;
          let depth = 0;
          let fiberData = {};
          while (current && depth < 10) {
            const keys = Object.keys(current);
            const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            const propsKey = keys.find(k => k.startsWith('__reactProps$'));
            
            if (propsKey && current[propsKey]) {
              const props = current[propsKey];
              if (props.leadId || props.contactId) fiberData.leadId = props.leadId || props.contactId || fiberData.leadId;
              if (props.leadName || props.contactName) fiberData.leadName = props.leadName || props.contactName || fiberData.leadName;
              if (props.leadPhone || props.phoneNumber) fiberData.leadPhone = props.leadPhone || props.phoneNumber || fiberData.leadPhone;
              if (props.blockName || props.nodeName) fiberData.blockName = props.blockName || props.nodeName || fiberData.blockName;
              if (props.blockId || props.nodeId) fiberData.blockId = props.blockId || props.nodeId || fiberData.blockId;
            }
            if (fiberKey && current[fiberKey]) {
              let fiber = current[fiberKey];
              let fiberDepth = 0;
              while (fiber && fiberDepth < 10) {
                const propsList = [fiber.memoizedProps, fiber.stateNode?.props].filter(Boolean);
                for (const props of propsList) {
                  if (props.leadId || props.contactId) fiberData.leadId = props.leadId || props.contactId || fiberData.leadId;
                  if (props.leadName || props.contactName) fiberData.leadName = props.leadName || props.contactName || fiberData.leadName;
                  if (props.leadPhone || props.phoneNumber) fiberData.leadPhone = props.leadPhone || props.phoneNumber || fiberData.leadPhone;
                  if (props.blockName || props.nodeName) fiberData.blockName = props.blockName || props.nodeName || fiberData.blockName;
                  if (props.blockId || props.nodeId) fiberData.blockId = props.blockId || props.nodeId || fiberData.blockId;
                  
                  const leadObj = props.lead || props.contact || props.chat || props.conversation;
                  if (leadObj && typeof leadObj === 'object') {
                    fiberData.leadId = leadObj.id || leadObj._id || fiberData.leadId;
                    fiberData.leadName = leadObj.name || leadObj.pushname || fiberData.leadName;
                    fiberData.leadPhone = leadObj.phone || leadObj.phoneNumber || leadObj.contactId || fiberData.leadPhone;
                  }
                }
                fiber = fiber.return;
                fiberDepth++;
              }
            }
            current = current.parentElement;
            depth++;
          }
          
          if (fiberData.leadId) ctx.leadId = ctx.leadId || fiberData.leadId;
          if (fiberData.leadName) ctx.leadName = ctx.leadName || fiberData.leadName;
          if (fiberData.leadPhone) ctx.leadPhone = ctx.leadPhone || fiberData.leadPhone;
          if (fiberData.blockName) ctx.blockName = ctx.blockName || fiberData.blockName;
          if (fiberData.blockId) ctx.blockId = ctx.blockId || fiberData.blockId;
        }
      } catch (e) {}

      // Merge clickedContext if any of its values are set, prioritizing them over static scrapes
      for (const key in clickedContext) {
        if (clickedContext[key] !== null) {
          ctx[key] = clickedContext[key];
        }
      }

    } catch (e) {
      console.warn('CrazyDiagnostics: Erro ao mapear contexto da página:', e);
    }

    return ctx;
  }

  // Helper to merge contexts key-by-key, prioritizing valid API context values
  function mergeContexts(domCtx, apiCtx) {
    const merged = {};
    const dCtx = domCtx || {};
    const aCtx = apiCtx || {};
    const allKeys = new Set([...Object.keys(dCtx), ...Object.keys(aCtx)]);
    for (const key of allKeys) {
      const apiVal = aCtx[key];
      const domVal = dCtx[key];
      if (apiVal !== null && apiVal !== undefined && apiVal !== '') {
        merged[key] = apiVal;
      } else {
        merged[key] = domVal !== undefined ? domVal : null;
      }
    }
    return merged;
  }

  // 2. Listen to messages from the injected script and forward to background worker
  window.addEventListener('message', function(event) {
    // Only trust messages from our injected script on the same window
    if (event.source !== window) return;
    if (event.data && event.data.source === 'CRAZY_DIAGNOSTICS_INJECTED') {
      const msg = event.data;
      if (msg.token !== handshakeToken) {
        return;
      }

      // Handle internal tenant switch event
      if (msg.type === 'TENANT_CHANGED') {
        const tenantId = msg.data?.tenantId;
        if (tenantId) {
          clickedContext.companyId = tenantId;
        }
        return;
      }

      const domContext = getPageContext();
      const apiContext = msg.data?.context;
      
      chrome.runtime.sendMessage({
        source: 'CRAZY_DIAGNOSTICS_CONTENT',
        type: msg.type,
        timestamp: msg.timestamp,
        data: {
          ...msg.data,
          pageUrl: window.location.href,
          context: mergeContexts(domContext, apiContext)
        }
      });
    }
  });

  // Cache to avoid duplicate toast captures in rapid succession (within 30 seconds)
  const recentToasts = new Map();
  const DUP_TIMEOUT_MS = 30000;

  let ignoredToasts = new Set([
    'conectado', 'ativo', 'online',
    'salvar', 'cancelar', 'excluir', 'deletar', 'remover',
    'gerenciar', 'criar', 'gerenciando', 'carregando', 'processando',
    'sucesso', 'enviado', 'recebido', 'lido', 'ok', 'fechar', 'voltar'
  ]);

  // Load dynamic ignored toasts from storage
  chrome.storage.local.get(['dynamic_ignored_toasts'], function(result) {
    if (result.dynamic_ignored_toasts && Array.isArray(result.dynamic_ignored_toasts)) {
      ignoredToasts = new Set(result.dynamic_ignored_toasts.map(t => String(t).toLowerCase().trim()));
    }
  });

  function shouldReportToast(text) {
    if (!text) return false;
    const cleanText = text.trim().toLowerCase();
    
    if (ignoredToasts.has(cleanText)) {
      return false;
    }
    
    // Ignore if it is just a pure number
    if (/^\d+$/.test(cleanText)) {
      return false;
    }

    // Ignore time formats (e.g., "10:19:20" or "10:19")
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanText)) {
      return false;
    }

    // Ignore numbers with simple units or result labels (e.g. "7 resultados", "50 px", "10 ms")
    if (/^\d+\s*(px|ms|s|sec|seg|segundos|min|minutos|h|horas|d|dias|resultados?|itens?|items?|logs?)$/.test(cleanText)) {
      return false;
    }

    return true;
  }

  function isWarningOrErrorColor(element) {
    if (!element) return null;
    
    // Traverse up to 3 levels (self + 2 parents) to detect color classes or styles from wrappers/toasts
    let current = element;
    for (let i = 0; i < 3; i++) {
      if (!current || current === document.body) break;

      // 1. Fast-path: Check CSS class names for common error/warning patterns to avoid layout thrashing
      const classList = String(current.className || '').toLowerCase();
      const hasErrorClass = classList.includes('red') || classList.includes('danger') || classList.includes('error') || classList.includes('rose') || classList.includes('alert-danger') || classList.includes('destructive');
      if (hasErrorClass) return 'error';
      
      const hasWarningClass = classList.includes('yellow') || classList.includes('warning') || classList.includes('amber') || classList.includes('orange') || classList.includes('alert-warning') || classList.includes('warn');
      if (hasWarningClass) return 'warning';

      // 2. Slow-path: Fallback to getComputedStyle
      try {
        const style = window.getComputedStyle(current);
        const color = style.color || '';
        const bgColor = style.backgroundColor || '';
        
        function parseRGB(rgbStr) {
          if (!rgbStr) return null;
          // Ignore transparent background colors
          if (rgbStr.includes('rgba') && (rgbStr.endsWith(', 0)') || rgbStr.endsWith(', 0.0)'))) return null;
          if (rgbStr === 'transparent') return null;
          const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (match) {
            return {
              r: parseInt(match[1]),
              g: parseInt(match[2]),
              b: parseInt(match[3])
            };
          }
          return null;
        }

        const textRGB = parseRGB(color);
        const bgRGB = parseRGB(bgColor);

        function checkRGB(rgb) {
          if (!rgb) return null;
          const { r, g, b } = rgb;
          // Relative dominant comparison (more robust for Tailwind pastels and dark text colors)
          // High red (Error): R is dominant, and significantly higher than G and B
          if (r > 100 && r > 1.35 * g && r > 1.35 * b) {
            return 'error';
          }
          // High yellow/orange/amber (Warning): R and G are dominant, R > G (or R close to G), and B is low
          if (r > 100 && g > 60 && r > 0.9 * g && g > 1.35 * b) {
            return 'warning';
          }
          return null;
        }

        const result = checkRGB(textRGB) || checkRGB(bgRGB);
        if (result) return result;
      } catch (e) {}

      current = current.parentElement;
    }
    return null;
  }

  function getCardDetails(node, statusText) {
    if (!node) return null;
    let current = node;
    let cardEl = null;
    
    // Traverse up to 5 levels to find the card container
    for (let i = 0; i < 5; i++) {
      if (!current || current === document.body) break;
      const text = (current.innerText || '').trim();
      // A card containing connection details usually has name and status
      if (text.includes(statusText) && text.length > statusText.length + 10) {
        cardEl = current;
        break;
      }
      current = current.parentElement;
    }
    if (!cardEl) return null;

    const lines = cardEl.innerText.split('\n').map(l => l.trim()).filter(Boolean);
    
    // Filter out status, actions, URLs, and long description texts
    const cleanLines = lines.filter(l => {
      const lower = l.toLowerCase();
      if (lower.startsWith('desconectado') || lower.startsWith('conectado') || lower.startsWith('pendente') || lower.startsWith('inativo')) return false;
      if (lower === 'gerenciar' || lower === 'criar' || lower === 'salvar') return false;
      if (lower.includes('http://') || lower.includes('https://') || lower.includes('.com') || lower.includes('.io')) return false;
      if (l.length >= 50) return false;
      return true;
    });

    if (cleanLines.length >= 3) {
      return {
        provider: cleanLines[0],
        serviceType: cleanLines[1],
        instanceName: cleanLines[2]
      };
    } else if (cleanLines.length === 2) {
      return {
        provider: cleanLines[0],
        serviceType: 'Whatsapp',
        instanceName: cleanLines[1]
      };
    } else if (cleanLines.length === 1) {
      return {
        provider: 'Whatsapp',
        serviceType: 'Whatsapp',
        instanceName: cleanLines[0]
      };
    }
    
    return null;
  }

  function reportToast(text, className, node) {
    if (!shouldReportToast(text)) return;

    const now = Date.now();
    // Normalize text to check for duplicates
    const normalized = text.trim().toLowerCase();
    
    if (recentToasts.has(normalized)) {
      const lastTime = recentToasts.get(normalized);
      if (now - lastTime < DUP_TIMEOUT_MS) {
        return; // Skip duplicate
      }
    }
    
    recentToasts.set(normalized, now);
    // Cleanup old items from cache
    if (recentToasts.size > 50) {
      for (const [key, val] of recentToasts.entries()) {
        if (now - val > DUP_TIMEOUT_MS) {
          recentToasts.delete(key);
        }
      }
    }

    // Scrape card details if text represents a connection status
    let additionalContext = {};
    const lowerText = text.trim().toLowerCase();
    if (node && (lowerText.includes('desconectado') || lowerText.includes('pendente') || lowerText.includes('inativo') || lowerText.includes('offline'))) {
      const cardDetails = getCardDetails(node, text.trim());
      if (cardDetails) {
        additionalContext = {
          connectionName: cardDetails.instanceName,
          connectionProvider: cardDetails.provider,
          connectionStatus: text.trim()
        };
      } else {
        additionalContext = {
          connectionStatus: text.trim()
        };
      }
    }

    // Forward toast error details to background
    chrome.runtime.sendMessage({
      source: 'CRAZY_DIAGNOSTICS_CONTENT',
      type: 'UI_TOAST_ERROR',
      timestamp: new Date().toISOString(),
      data: {
        message: text.trim(),
        classes: className,
        url: null,
        pageUrl: window.location.href,
        context: {
          ...getPageContext(),
          ...additionalContext
        }
      }
    });
  }

  // 3. MutationObserver to watch for error toasts, alerts, and modal dialogs globally
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach(function(node) {
          // We only inspect element nodes
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const el = node;
          const classList = String(el.className || '');
          const htmlContent = el.innerHTML || '';
          
          // Use textContent (fast) instead of innerText (slow) for initial detection
          const text = el.textContent || '';
          const normalizedText = text.toLowerCase();

          // CRM-specific warnings that we must capture
          const isCRMWarningText = 
            normalizedText.includes('24 horas') || 
            normalizedText.includes('não suportad') ||
            normalizedText.includes('unsupported') ||
            normalizedText.includes('template');
          
          // Check if the element looks like a toast, alert, or modal popup
          const isToastOrAlert = 
            isCRMWarningText ||
            classList.includes('toast') || 
            classList.includes('alert') || 
            classList.includes('notification') || 
            classList.includes('popup') || 
            classList.includes('modal') || 
            classList.includes('swal') ||
            classList.includes('message') ||
            classList.includes('banner') ||
            el.getAttribute('role') === 'alert' ||
            el.getAttribute('aria-live') === 'assertive';

          if (isToastOrAlert) {
            // Keywords indicating this is an error/warning alert
            const hasErrorKeywords = 
              isCRMWarningText ||
              normalizedText.includes('não foi possível') || 
              normalizedText.includes('falha') || 
              normalizedText.includes('erro') || 
              normalizedText.includes('inválid') || 
              normalizedText.includes('error') || 
              normalizedText.includes('failed') || 
              normalizedText.includes('locked') || 
              normalizedText.includes('bloqueado') ||
              normalizedText.includes('desabilitad') ||
              normalizedText.includes('restringid') ||
              normalizedText.includes('incorrect') ||
              normalizedText.includes('incorret') ||
              normalizedText.includes('problema') ||
              normalizedText.includes('cannot');

            // Also check for red/warning background/border classes (common in Tailwind/Bootstrap/Vanilla)
            const hasRedColor = 
              classList.includes('red') || 
              classList.includes('danger') || 
              classList.includes('warning') || 
              classList.includes('error') ||
              classList.includes('rose') ||
              classList.includes('yellow') ||
              classList.includes('amber') ||
              classList.includes('orange') ||
              htmlContent.includes('red') || 
              htmlContent.includes('danger') || 
              htmlContent.includes('warning') ||
              htmlContent.includes('rose') ||
              htmlContent.includes('yellow') ||
              htmlContent.includes('amber') ||
              htmlContent.includes('orange');

            if (text.trim().length > 3 && (hasErrorKeywords || hasRedColor)) {
              // Retrieve innerText only at reporting time to avoid layout thrashing
              const cleanText = el.innerText || text;
              reportToast(cleanText, classList, el);
            }
          } else {
            // Collect all candidate elements to check (including el itself + its descendants)
            const candidates = [el];
            if (el.querySelectorAll) {
              const descendants = el.querySelectorAll('div, span, p, label, a, [role="alert"]');
              descendants.forEach(d => candidates.push(d));
            }

            candidates.forEach(function(candidate) {
              if (candidate.children && candidate.children.length > 1) return; // Only check leaf elements
              const textVal = (candidate.textContent || '').trim();
              if (textVal.length > 3 && textVal.length < 300) {
                const lowerText = textVal.toLowerCase();
                const hasKeyword = candidateKeywords.some(kw => lowerText.includes(kw));
                if (hasKeyword) {
                  const colorType = isWarningOrErrorColor(candidate);
                  if (colorType) {
                    reportToast(candidate.innerText || textVal, candidate.className || '', candidate);
                  }
                }
              }
            });

            // Also check descendants for CRM specific warnings text (keyword-only fallback)
            if (isCRMWarningText) {
              const warningCandidates = [el];
              if (el.querySelectorAll) {
                const descendants = el.querySelectorAll('div, span, p, label');
                descendants.forEach(d => warningCandidates.push(d));
              }
              warningCandidates.forEach(function(desc) {
                if (desc.children && desc.children.length > 0) return; // Leaf node
                const descText = (desc.textContent || '').trim();
                const descNormalized = descText.toLowerCase();
                if (
                  descText.length > 3 && 
                  (descNormalized.includes('24 horas') || descNormalized.includes('não suportad') || descNormalized.includes('unsupported') || descNormalized.includes('template'))
                ) {
                  reportToast(desc.innerText || descText, desc.className || '', desc);
                }
              });
            }
          }
        });
      }
    });
  });

  // Start observing
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
  // Listen to messages from popup or background script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'PING') {
      sendResponse({ alive: true, area: getPageContext()?.area || 'general' });
      return true;
    }
    if (request.action === 'GET_CURRENT_CONTEXT') {
      sendResponse({ context: getPageContext() });
    }
    return true; // Keep channel open for async response
  });
})();
