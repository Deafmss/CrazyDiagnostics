(function() {
  console.log('CrazyLayoutMapper: Active on page.', window.location.href);

  let debounceTimeout = null;
  let isServerOffline = false;
  let lastServerCheck = 0;
  let lastUrl = window.location.href;

  function triggerSync() {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    
    const currentUrl = window.location.href;
    const delay = currentUrl !== lastUrl ? 500 : 1500;
    lastUrl = currentUrl;
    
    debounceTimeout = setTimeout(() => {
      syncLayout();
    }, delay);
  }

  function getElementXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    if (element === document.body) {
      return '/html/body';
    }
    let ix = 0;
    const siblings = element.parentNode ? element.parentNode.childNodes : [];
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        return getElementXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        ix++;
      }
    }
    return '';
  }

  function getElementSelector(element) {
    if (element.id) return `#${element.id}`;
    let path = [];
    let current = element;
    while (current && current !== document.documentElement && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const classNameStr = typeof current.className === 'string' ? current.className : (current.className?.animVal || '');
      if (classNameStr) {
        const firstClass = classNameStr.split(/\s+/)[0];
        if (firstClass && !firstClass.includes(':') && !firstClass.includes('[') && !firstClass.includes(']')) {
          selector += `.${firstClass}`;
        }
      }
      path.unshift(selector);
      current = current.parentNode;
    }
    return path.join(' > ');
  }

  function scrapeTabsAndPanels() {
    const tabs = [];
    const tabElements = document.querySelectorAll('[role="tab"], [class*="tab"], [data-tab]');
    tabElements.forEach(tab => {
      const text = (tab.innerText || '').trim();
      if (text && text.length < 100) {
        tabs.push({
          text: text,
          isActive: tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('selected'),
          ariaLabel: tab.getAttribute('aria-label') || null,
          id: tab.id || null
        });
      }
    });
    return tabs;
  }

  function scrapeModalsAndOverlays() {
    const modals = [];
    const modalElements = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="overlay"], [class*="popup"], [class*="drawer"]');
    modalElements.forEach(modal => {
      const isVisible = modal.offsetWidth > 0 && modal.offsetHeight > 0;
      const title = (modal.querySelector('h1, h2, h3, [class*="title"]')?.innerText || '').trim();
      if (title || isVisible) {
        modals.push({
          title: title || '(sem título)',
          isVisible: isVisible,
          classes: typeof modal.className === 'string' ? modal.className : '',
          role: modal.getAttribute('role') || null,
          ariaLabel: modal.getAttribute('aria-label') || null,
          text: isVisible ? (modal.innerText || '').trim().substring(0, 2000).replace(/\n+/g, ' | ') : null
        });
      }
    });
    return modals;
  }

  function scrapeIframes() {
    const iframes = [];
    document.querySelectorAll('iframe').forEach(iframe => {
      iframes.push({
        src: iframe.src || null,
        id: iframe.id || null,
        title: iframe.title || null,
        isVisible: iframe.offsetWidth > 0 && iframe.offsetHeight > 0,
        bounds: (() => { const r = iframe.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()
      });
    });
    return iframes;
  }

  function syncLayout() {
    try {
      if (isServerOffline && Date.now() - lastServerCheck < 15000) {
        return; // Skip if server is offline and checked recently
      }

      const layout = {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        route: window.location.pathname + window.location.search + window.location.hash,
        
        // A. Sidebar Nav
        sidebarMenu: scrapeSidebarMenu(),

        // B. Active Chat context
        activeChat: scrapeActiveChatInfo(),

        // C. Kanban columns & cards
        kanban: scrapeKanban(),

        // D. Automation Builder blocks
        automations: scrapeAutomations(),

        // E. Dashboard Metrics
        dashboard: scrapeDashboard(),

        // F. Interactive controls list (all buttons & anchors)
        controls: scrapeControls(),

        // G. Form Fields
        forms: scrapeForms(),

        // H. Raw headings
        headings: Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
          tag: h.tagName,
          text: (h.innerText || h.textContent).trim(),
          classes: h.className
        })),

        // I. Tabs
        tabs: scrapeTabsAndPanels(),

        // J. Modals
        modals: scrapeModalsAndOverlays(),

        // K. Iframes
        iframes: scrapeIframes()
      };

      // Send to local server (use 127.0.0.1 to avoid Windows IPv6 resolution issues)
      chrome.storage.local.get(['mapper_token'], function(result) {
        const token = result.mapper_token || '';
        fetch('http://127.0.0.1:3003/save-layout', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Mapper-Token': token
          },
          body: JSON.stringify(layout)
        })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            isServerOffline = false;
            console.log('CrazyLayoutMapper: Layout sincronizado com sucesso.');
          }
        })
        .catch(err => {
          isServerOffline = true;
          lastServerCheck = Date.now();
          console.debug('CrazyLayoutMapper: Servidor local offline (127.0.0.1:3003).');
        });
      });

    } catch (e) {
      console.warn('CrazyLayoutMapper: Error syncing layout:', e);
    }
  }

  // SCRAPING HELPERS
  function scrapeSidebarMenu() {
    const items = [];
    const elements = document.querySelectorAll('aside a, [class*="sidebar"] a, [class*="nav"] a, [class*="menu"] a, aside [role="button"]');
    elements.forEach(el => {
      const text = (el.innerText || el.textContent || '').trim().split('\n')[0];
      if (text) {
        items.push({
          text: text,
          href: el.getAttribute('href') || null,
          classes: typeof el.className === 'string' ? el.className : '',
          isActive: typeof el.className === 'string' && (el.className.includes('active') || el.className.includes('selected') || el.className.includes('current'))
        });
      }
    });
    return items;
  }

  function scrapeActiveChatInfo() {
    const chat = {
      header: null,
      selectedItemText: null,
      detailsPanel: null
    };

    // Scrape header name
    const headerEl = document.querySelector('[class*="chat-header"] [class*="name"], [class*="conversation-header"] [class*="name"], h2[class*="chat"], .chat-header-name');
    if (headerEl) {
      chat.header = {
        text: headerEl.innerText.trim(),
        classes: headerEl.className
      };
    }

    // Scrape selected item in list
    const activeItem = document.querySelector('[class*="item"][class*="active"], [class*="item"][class*="selected"], [class*="chat-list-item"][class*="active"]');
    if (activeItem) {
      chat.selectedItemText = (activeItem.innerText || '').trim().replace(/\n+/g, ' | ');
    }

    // Scrape right profile drawer
    const rightPanel = document.querySelector('aside, [class*="sidebar"], [class*="drawer"], [class*="profile"]');
    if (rightPanel) {
      const rect = rightPanel.getBoundingClientRect();
      if (rect.left > window.innerWidth / 2) {
        chat.detailsPanel = {
          title: (rightPanel.querySelector('h1, h2, h3, strong')?.innerText || '').trim(),
          text: (rightPanel.innerText || '').trim().substring(0, 5000).replace(/\n+/g, ' | ')
        };
      }
    }

    return chat;
  }

  function scrapeKanban() {
    const kanban = {
      columns: []
    };

    const columns = document.querySelectorAll('[class*="column"], [class*="stage"], [class*="list"]');
    columns.forEach(col => {
      const colTitleEl = col.querySelector('[class*="title"], [class*="header"], h3, h4');
      const colTitle = colTitleEl ? colTitleEl.innerText.trim() : '';
      if (!colTitle) return;

      const colData = {
        title: colTitle,
        classes: col.className,
        cards: []
      };

      const cards = col.querySelectorAll('[class*="card"], [class*="item"]');
      cards.forEach(card => {
        const cardText = (card.innerText || '').trim();
        if (cardText && cardText !== colTitle) {
          const rect = card.getBoundingClientRect();
          colData.cards.push({
            text: cardText.substring(0, 500).replace(/\n+/g, ' | '),
            classes: typeof card.className === 'string' ? card.className : '',
            id: card.getAttribute('data-id') || card.getAttribute('data-card-id') || null,
            bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
          });
        }
      });

      if (colData.cards.length > 0) {
        kanban.columns.push(colData);
      }
    });

    return kanban;
  }

  function scrapeAutomations() {
    const automations = {
      title: null,
      nodes: []
    };

    // Scrape editor title
    const titleEl = document.querySelector('h1, h2, [class*="title-editor"], [class*="flow-name"]');
    if (titleEl) {
      automations.title = titleEl.innerText.trim();
    }

    const nodes = document.querySelectorAll('[class*="node"], [class*="block"], [class*="step"]');
    nodes.forEach(node => {
      const nodeText = (node.innerText || '').trim();
      if (nodeText && nodeText.length < 300) {
        const rect = node.getBoundingClientRect();
        automations.nodes.push({
          text: nodeText.replace(/\n+/g, ' | '),
          classes: typeof node.className === 'string' ? node.className : '',
          id: node.getAttribute('data-id') || node.getAttribute('data-node-id') || null,
          isSelected: typeof node.className === 'string' && (node.className.includes('selected') || node.className.includes('active')),
          bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
        });
      }
    });

    return automations;
  }

  function scrapeDashboard() {
    const metrics = [];
    const elements = document.querySelectorAll('[class*="metric"], [class*="widget"], [class*="card"]');
    elements.forEach(el => {
      const text = (el.innerText || '').trim();
      if (text && text.length < 500) {
        const rect = el.getBoundingClientRect();
        metrics.push({
          text: text.replace(/\n+/g, ' | '),
          classes: typeof el.className === 'string' ? el.className : '',
          bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
        });
      }
    });
    return metrics;
  }

  function scrapeControls() {
    const controls = [];
    const buttons = document.querySelectorAll('button, a[role="button"], input[type="button"], input[type="submit"]');
    buttons.forEach(btn => {
      const text = (btn.innerText || btn.value || '').trim();
      if (text) {
        const rect = btn.getBoundingClientRect();
        controls.push({
          type: 'button',
          text: text,
          id: btn.id || null,
          classes: typeof btn.className === 'string' ? btn.className : '',
          selector: getElementSelector(btn),
          xpath: getElementXPath(btn),
          ariaLabel: btn.getAttribute('aria-label') || null,
          role: btn.getAttribute('role') || null,
          testId: btn.getAttribute('data-testid') || btn.getAttribute('data-cy') || btn.getAttribute('data-test') || null,
          disabled: btn.disabled || btn.getAttribute('aria-disabled') === 'true',
          bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
        });
      }
    });
    return controls;
  }

  function scrapeForms() {
    const fields = [];
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.type === 'hidden') return;
      
      const labelEl = document.querySelector(`label[for="${input.id}"]`) || input.closest('label');
      const labelText = labelEl ? labelEl.innerText.trim() : '';

      fields.push({
        type: input.tagName.toLowerCase() + (input.type ? `:${input.type}` : ''),
        id: input.id || null,
        name: input.name || null,
        placeholder: input.placeholder || null,
        value: input.value || null,
        labelText: labelText || null,
        classes: typeof input.className === 'string' ? input.className : '',
        selector: getElementSelector(input),
        ariaLabel: input.getAttribute('aria-label') || null,
        role: input.getAttribute('role') || null,
        testId: input.getAttribute('data-testid') || input.getAttribute('data-cy') || input.getAttribute('data-test') || null,
        disabled: input.disabled || input.getAttribute('aria-disabled') === 'true'
      });
    });
    return fields;
  }

  // 1. Initial sync
  triggerSync();

  // 2. Sync on clicks/interactions
  document.addEventListener('mouseup', triggerSync);
  document.addEventListener('keyup', triggerSync);

  // 3. Mutation Observer to capture dynamic SPA rendering changes
  const observer = new MutationObserver(triggerSync);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
})();
