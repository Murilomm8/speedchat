(() => {
  const DEFAULT_VISIBLE_MESSAGES = 30;
  const MIN_VISIBLE_MESSAGES = 10;
  const MAX_VISIBLE_MESSAGES = 120;
  const STEP_VISIBLE_MESSAGES = 5;

  const STORAGE_ENABLED_KEY = 'speedchatEnabled';
  const STORAGE_VISIBLE_MESSAGES_KEY = 'speedchatVisibleMessages';
  const STORAGE_ULTRA_MODE_KEY = 'speedchatUltraMode';

  const HIDDEN_CLASS = 'speedchat-hidden';
  const PANEL_ID = 'speedchat-panel';
  const STATUS_BADGE_ID = 'speedchat-status-badge';
  const RANGE_INPUT_ID = 'speedchat-range';
  const RANGE_VALUE_ID = 'speedchat-range-value';
  const TOGGLE_INPUT_ID = 'speedchat-enabled-toggle';
  const CUTOFF_MARKER_ID = 'speedchat-cutoff-marker';
  const TURBO_BUTTON_ID = 'speedchat-turbo-clean';
  const TURBO_INFO_ID = 'speedchat-turbo-info';
  const ULTRA_TOGGLE_ID = 'speedchat-ultra-toggle';
  const STATS_RENDERED_ID = 'speedchat-stats-rendered';
  const STATS_REMOVED_ID = 'speedchat-stats-removed';

  let speedModeEnabled = true;
  let visibleMessagesCount = DEFAULT_VISIBLE_MESSAGES;
  let ultraModeEnabled = false;
  let purgedMessagesCount = 0;
  let currentRenderedCount = 0;

  let rafId = null;
  let debounceTimer = null;
  let observer = null;
  let bodyWaitTimer = null;
  let suppressObserverUntil = 0;
  let lastStreamingUpdateAt = 0;
  let lastAppliedSignature = '';

  const STREAMING_UPDATE_INTERVAL_MS = 1200;

  const isResponseStreaming = () =>
    Boolean(
      document.querySelector(
        'button[aria-label*="Stop" i], button[data-testid*="stop" i], [data-testid*="stop" i], [aria-live="polite"] [data-testid*="typing" i]'
      )
    );

  const isLikelyMessageNode = (node) => {
    if (!(node instanceof Element)) {
      return false;
    }

    if (node.id === PANEL_ID || node.id === CUTOFF_MARKER_ID || node.closest(`#${PANEL_ID}`)) {
      return false;
    }

    if (
      node.matches('article, article *, [data-message-author-role], [data-testid*="conversation"], [data-testid*="message"]')
    ) {
      return true;
    }

    return Boolean(node.querySelector('article, [data-message-author-role], [data-testid*="conversation"], [data-testid*="message"]'));
  };

  const getMessageBlocks = () => {
    const primary = Array.from(document.querySelectorAll('article[data-testid]')).filter(
      (article) => article.isConnected && (article.textContent || '').trim().length > 0
    );

    if (primary.length >= 2) {
      return primary;
    }

    const allArticles = Array.from(document.querySelectorAll('article')).filter(
      (article) => article.isConnected && (article.textContent || '').trim().length > 0
    );

    if (allArticles.length >= 2) {
      return allArticles;
    }

    return Array.from(
      document.querySelectorAll('[data-message-author-role], [data-testid*="conversation"], [data-testid*="message"]')
    ).filter((node) => node.isConnected && (node.textContent || '').trim().length > 0);
  };

  const updatePanelUI = () => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }

    const badge = panel.querySelector(`#${STATUS_BADGE_ID}`);
    const rangeInput = panel.querySelector(`#${RANGE_INPUT_ID}`);
    const rangeValue = panel.querySelector(`#${RANGE_VALUE_ID}`);
    const toggleInput = panel.querySelector(`#${TOGGLE_INPUT_ID}`);
    const ultraToggle = panel.querySelector(`#${ULTRA_TOGGLE_ID}`);
    const turboButton = panel.querySelector(`#${TURBO_BUTTON_ID}`);
    const turboInfo = panel.querySelector(`#${TURBO_INFO_ID}`);
    const renderedStat = panel.querySelector(`#${STATS_RENDERED_ID}`);
    const removedStat = panel.querySelector(`#${STATS_REMOVED_ID}`);

    if (badge) {
      badge.textContent = speedModeEnabled ? 'ON' : 'OFF';
      badge.classList.toggle('is-off', !speedModeEnabled);
    }

    if (toggleInput) {
      toggleInput.checked = speedModeEnabled;
    }

    if (ultraToggle) {
      ultraToggle.checked = ultraModeEnabled;
      ultraToggle.disabled = !speedModeEnabled;
    }

    if (rangeInput) {
      rangeInput.value = String(visibleMessagesCount);
      rangeInput.disabled = !speedModeEnabled;
    }

    if (rangeValue) {
      rangeValue.textContent = `${visibleMessagesCount} mensagens`;
      rangeValue.classList.toggle('is-disabled', !speedModeEnabled);
    }

    if (turboButton) {
      turboButton.disabled = !speedModeEnabled;
    }

    if (renderedStat) {
      renderedStat.textContent = String(currentRenderedCount);
    }

    if (removedStat) {
      removedStat.textContent = String(purgedMessagesCount);
    }

    if (turboInfo) {
      if (purgedMessagesCount > 0) {
        turboInfo.textContent = `🚀 Turbo já removeu ${purgedMessagesCount} mensagens do DOM. Recarregue a página para restaurar tudo.`;
        turboInfo.classList.add('is-visible');
      } else {
        turboInfo.textContent = ultraModeEnabled
          ? 'Modo Ultra ativo: mensagens antigas são removidas automaticamente do DOM para máxima velocidade.'
          : 'Turbo opcional: remove mensagens já ocultas do DOM para reduzir uso de memória.';
        turboInfo.classList.remove('is-visible');
      }
    }
  };

  const removeHiddenMessagesFromDOM = () => {
    const hiddenMessages = getMessageBlocks().filter((message) => message.classList.contains(HIDDEN_CLASS));

    if (!hiddenMessages.length) {
      return 0;
    }

    suppressObserverUntil = Date.now() + 300;

    for (let i = 0; i < hiddenMessages.length; i += 1) {
      hiddenMessages[i].remove();
    }

    return hiddenMessages.length;
  };

  const hideOlderMessages = () => {
    const messages = getMessageBlocks();
    const existingMarker = document.getElementById(CUTOFF_MARKER_ID);

    if (existingMarker) {
      existingMarker.remove();
    }

    currentRenderedCount = messages.length;

    if (!messages.length) {
      updatePanelUI();
      return;
    }

    const keepFrom = Math.max(messages.length - visibleMessagesCount, 0);

    const nextSignature = `${speedModeEnabled}-${ultraModeEnabled}-${visibleMessagesCount}-${messages.length}-${keepFrom}`;
    if (nextSignature === lastAppliedSignature) {
      updatePanelUI();
      return;
    }

    for (let i = 0; i < messages.length; i += 1) {
      if (speedModeEnabled && i < keepFrom) {
        messages[i].classList.add(HIDDEN_CLASS);
      } else {
        messages[i].classList.remove(HIDDEN_CLASS);
      }
    }

    if (speedModeEnabled && keepFrom > 0) {
      const firstVisibleMessage = messages[keepFrom];

      if (firstVisibleMessage && firstVisibleMessage.parentElement) {
        const marker = document.createElement('div');
        marker.id = CUTOFF_MARKER_ID;
        marker.className = 'speedchat-cutoff-marker';
        marker.textContent = `⚡ SpeedChat ocultou ${keepFrom} mensagens anteriores`;
        firstVisibleMessage.parentElement.insertBefore(marker, firstVisibleMessage);
      }
    }

    if (speedModeEnabled && ultraModeEnabled) {
      const removed = removeHiddenMessagesFromDOM();
      if (removed > 0) {
        purgedMessagesCount += removed;
        currentRenderedCount = Math.max(visibleMessagesCount, messages.length - removed);
        lastAppliedSignature = '';
      }
    }

    if (lastAppliedSignature === '') {
      lastAppliedSignature = `${speedModeEnabled}-${ultraModeEnabled}-${visibleMessagesCount}-${currentRenderedCount}-${Math.max(
        currentRenderedCount - visibleMessagesCount,
        0
      )}`;
    } else {
      lastAppliedSignature = nextSignature;
    }

    updatePanelUI();
  };

  const scheduleUpdate = () => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        hideOlderMessages();
      });
    }, 80);
  };

  const setSpeedMode = async (enabled) => {
    speedModeEnabled = Boolean(enabled);
    lastAppliedSignature = '';
    updatePanelUI();
    await chrome.storage.local.set({ [STORAGE_ENABLED_KEY]: speedModeEnabled });
    scheduleUpdate();
  };

  const setUltraMode = async (enabled) => {
    ultraModeEnabled = Boolean(enabled);
    lastAppliedSignature = '';
    updatePanelUI();
    await chrome.storage.local.set({ [STORAGE_ULTRA_MODE_KEY]: ultraModeEnabled });
    scheduleUpdate();
  };

  const setVisibleMessagesCount = async (nextValue) => {
    const normalized = Math.min(
      MAX_VISIBLE_MESSAGES,
      Math.max(MIN_VISIBLE_MESSAGES, Number.parseInt(String(nextValue), 10) || DEFAULT_VISIBLE_MESSAGES)
    );

    visibleMessagesCount = normalized;
    lastAppliedSignature = '';
    updatePanelUI();
    await chrome.storage.local.set({ [STORAGE_VISIBLE_MESSAGES_KEY]: visibleMessagesCount });
    scheduleUpdate();
  };

  const runTurboCleanup = () => {
    if (!speedModeEnabled) {
      return;
    }

    const removed = removeHiddenMessagesFromDOM();
    if (removed > 0) {
      purgedMessagesCount += removed;
      lastAppliedSignature = '';
      scheduleUpdate();
    }

    updatePanelUI();
  };

  const buildPanel = () => {
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'speedchat-panel';

    panel.innerHTML = `
      <div class="speedchat-panel__header">
        <div>
          <p class="speedchat-panel__eyebrow">SpeedChat Filter</p>
          <h3 class="speedchat-panel__title">Modo desempenho</h3>
        </div>
        <span id="${STATUS_BADGE_ID}" class="speedchat-status-badge">ON</span>
      </div>

      <div class="speedchat-stats">
        <div class="speedchat-stat-card">
          <span class="speedchat-stat-card__label">Renderizadas</span>
          <strong id="${STATS_RENDERED_ID}" class="speedchat-stat-card__value">0</strong>
        </div>
        <div class="speedchat-stat-card">
          <span class="speedchat-stat-card__label">Removidas</span>
          <strong id="${STATS_REMOVED_ID}" class="speedchat-stat-card__value">0</strong>
        </div>
      </div>

      <label class="speedchat-switch" for="${TOGGLE_INPUT_ID}">
        <input id="${TOGGLE_INPUT_ID}" type="checkbox" checked />
        <span class="speedchat-switch__track"><span class="speedchat-switch__thumb"></span></span>
        <span class="speedchat-switch__label">Ativar filtro</span>
      </label>

      <label class="speedchat-switch" for="${ULTRA_TOGGLE_ID}">
        <input id="${ULTRA_TOGGLE_ID}" type="checkbox" />
        <span class="speedchat-switch__track"><span class="speedchat-switch__thumb"></span></span>
        <span class="speedchat-switch__label">Modo Ultra (auto limpar memória)</span>
      </label>

      <div class="speedchat-slider-group">
        <div class="speedchat-slider-group__labels">
          <span>Mensagens visíveis</span>
          <span id="${RANGE_VALUE_ID}" class="speedchat-slider-group__value">30 mensagens</span>
        </div>
        <input
          id="${RANGE_INPUT_ID}"
          class="speedchat-slider"
          type="range"
          min="${MIN_VISIBLE_MESSAGES}"
          max="${MAX_VISIBLE_MESSAGES}"
          step="${STEP_VISIBLE_MESSAGES}"
          value="${DEFAULT_VISIBLE_MESSAGES}"
        />
      </div>

      <button id="${TURBO_BUTTON_ID}" class="speedchat-turbo-button" type="button">
        ⚡ Limpar memória agora
      </button>
      <p id="${TURBO_INFO_ID}" class="speedchat-turbo-info">
        Turbo opcional: remove mensagens já ocultas do DOM para reduzir uso de memória.
      </p>
    `;

    const toggle = panel.querySelector(`#${TOGGLE_INPUT_ID}`);
    const ultraToggle = panel.querySelector(`#${ULTRA_TOGGLE_ID}`);
    const rangeInput = panel.querySelector(`#${RANGE_INPUT_ID}`);
    const turboButton = panel.querySelector(`#${TURBO_BUTTON_ID}`);

    toggle?.addEventListener('change', (event) => {
      const target = event.currentTarget;
      if (target instanceof HTMLInputElement) {
        setSpeedMode(target.checked);
      }
    });

    ultraToggle?.addEventListener('change', (event) => {
      const target = event.currentTarget;
      if (target instanceof HTMLInputElement) {
        setUltraMode(target.checked);
      }
    });

    rangeInput?.addEventListener('input', (event) => {
      const target = event.currentTarget;
      if (target instanceof HTMLInputElement) {
        setVisibleMessagesCount(target.value);
      }
    });

    turboButton?.addEventListener('click', () => {
      runTurboCleanup();
    });

    return panel;
  };

  const mountPanel = () => {
    if (!document.body) {
      return false;
    }

    if (document.getElementById(PANEL_ID)) {
      return true;
    }

    const panel = buildPanel();
    document.body.appendChild(panel);
    updatePanelUI();
    return true;
  };

  const ensurePanelMounted = () => {
    if (mountPanel()) {
      if (bodyWaitTimer) {
        window.clearInterval(bodyWaitTimer);
        bodyWaitTimer = null;
      }
      return;
    }

    if (bodyWaitTimer) {
      return;
    }

    bodyWaitTimer = window.setInterval(() => {
      if (mountPanel()) {
        window.clearInterval(bodyWaitTimer);
        bodyWaitTimer = null;
      }
    }, 200);
  };

  const startObserver = () => {
    if (!document.body) {
      return;
    }

    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      if (Date.now() < suppressObserverUntil) {
        return;
      }

      const relevant = mutations.some((mutation) => {
        if (mutation.type !== 'childList') {
          return false;
        }

        if (mutation.addedNodes.length > 0) {
          for (let i = 0; i < mutation.addedNodes.length; i += 1) {
            if (isLikelyMessageNode(mutation.addedNodes[i])) {
              return true;
            }
          }
        }

        if (mutation.removedNodes.length > 0) {
          for (let i = 0; i < mutation.removedNodes.length; i += 1) {
            if (isLikelyMessageNode(mutation.removedNodes[i])) {
              return true;
            }
          }
        }

        return false;
      });

      if (relevant) {
        if (isResponseStreaming()) {
          const now = Date.now();
          if (now - lastStreamingUpdateAt < STREAMING_UPDATE_INTERVAL_MS) {
            return;
          }
          lastStreamingUpdateAt = now;
        }

        ensurePanelMounted();
        scheduleUpdate();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
  };

  const init = async () => {
    const stored = await chrome.storage.local.get({
      [STORAGE_ENABLED_KEY]: true,
      [STORAGE_VISIBLE_MESSAGES_KEY]: DEFAULT_VISIBLE_MESSAGES,
      [STORAGE_ULTRA_MODE_KEY]: false
    });

    speedModeEnabled = Boolean(stored[STORAGE_ENABLED_KEY]);
    ultraModeEnabled = Boolean(stored[STORAGE_ULTRA_MODE_KEY]);
    visibleMessagesCount = Math.min(
      MAX_VISIBLE_MESSAGES,
      Math.max(MIN_VISIBLE_MESSAGES, Number.parseInt(String(stored[STORAGE_VISIBLE_MESSAGES_KEY]), 10) || DEFAULT_VISIBLE_MESSAGES)
    );

    ensurePanelMounted();
    startObserver();
    scheduleUpdate();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes[STORAGE_ENABLED_KEY]) {
        speedModeEnabled = Boolean(changes[STORAGE_ENABLED_KEY].newValue);
        lastAppliedSignature = '';
      }

      if (changes[STORAGE_ULTRA_MODE_KEY]) {
        ultraModeEnabled = Boolean(changes[STORAGE_ULTRA_MODE_KEY].newValue);
        lastAppliedSignature = '';
      }

      if (changes[STORAGE_VISIBLE_MESSAGES_KEY]) {
        visibleMessagesCount = Math.min(
          MAX_VISIBLE_MESSAGES,
          Math.max(
            MIN_VISIBLE_MESSAGES,
            Number.parseInt(String(changes[STORAGE_VISIBLE_MESSAGES_KEY].newValue), 10) || DEFAULT_VISIBLE_MESSAGES
          )
        );
        lastAppliedSignature = '';
      }

      updatePanelUI();
      scheduleUpdate();
    });

    // TODO: Pro Feature – smart search
    // TODO: Pro Feature – instant export
    // TODO: Pro Feature – AI message tagging
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
