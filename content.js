(() => {
  const MAX_VISIBLE_MESSAGES = 30;
  const STORAGE_KEY = 'speedchatEnabled';
  const HIDDEN_CLASS = 'speedchat-hidden';
  const TOGGLE_ID = 'speedchat-toggle';

  let speedModeEnabled = true;
  let rafId = null;
  let debounceTimer = null;
  let observer = null;
  let bodyWaitTimer = null;

  const hideOlderMessages = () => {
    const messages = getMessageBlocks();

    if (!messages.length) {
      return;
    }

    const keepFrom = Math.max(messages.length - MAX_VISIBLE_MESSAGES, 0);

    for (let i = 0; i < messages.length; i += 1) {
      if (speedModeEnabled && i < keepFrom) {
        messages[i].classList.add(HIDDEN_CLASS);
      } else {
        messages[i].classList.remove(HIDDEN_CLASS);
      }
    }
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
    }, 100);
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

  const updateToggleButton = () => {
    const button = document.getElementById(TOGGLE_ID);

    if (!button) {
      return;
    }

    button.setAttribute('aria-pressed', String(speedModeEnabled));
    button.textContent = speedModeEnabled ? 'SpeedChat: ON' : 'SpeedChat: OFF';
  };

  const setSpeedMode = async (enabled) => {
    speedModeEnabled = Boolean(enabled);
    updateToggleButton();
    await chrome.storage.local.set({ [STORAGE_KEY]: speedModeEnabled });
    scheduleUpdate();
  };

  const mountToggleButton = () => {
    if (!document.body) {
      return false;
    }

    if (document.getElementById(TOGGLE_ID)) {
      return true;
    }

    const button = document.createElement('button');
    button.id = TOGGLE_ID;
    button.type = 'button';
    button.className = 'speedchat-toggle';
    button.addEventListener('click', () => {
      setSpeedMode(!speedModeEnabled);
    });

    document.body.appendChild(button);
    updateToggleButton();
    return true;
  };

  const ensureToggleMounted = () => {
    if (mountToggleButton()) {
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
      if (mountToggleButton()) {
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
      const relevant = mutations.some((mutation) => mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0));

      if (relevant) {
        ensureToggleMounted();
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
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: true });
    speedModeEnabled = Boolean(stored[STORAGE_KEY]);

    ensureToggleMounted();
    startObserver();
    scheduleUpdate();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]) {
        return;
      }

      speedModeEnabled = Boolean(changes[STORAGE_KEY].newValue);
      updateToggleButton();
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
