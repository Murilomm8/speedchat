(() => {
  const MAX_VISIBLE_MESSAGES = 30;
  const STORAGE_KEY = 'speedchatEnabled';
  const HIDDEN_CLASS = 'speedchat-hidden';
  const TOGGLE_ID = 'speedchat-toggle';

  let speedModeEnabled = true;
  let rafId = null;
  let debounceTimer = null;
  let observer = null;

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
    const allArticles = Array.from(document.querySelectorAll('article'));

    const candidateArticles = allArticles.filter((article) => {
      if (!article.isConnected) {
        return false;
      }

      if (article.closest('#speedchat-toggle')) {
        return false;
      }

      const textLength = (article.textContent || '').trim().length;
      return textLength > 0;
    });

    if (candidateArticles.length >= 4) {
      return candidateArticles;
    }

    const roleBlocks = Array.from(
      document.querySelectorAll('[data-message-author-role], [data-testid*="conversation"], [data-testid*="message"]')
    ).filter((node) => node.isConnected && node.textContent && node.textContent.trim().length > 0);

    return roleBlocks;
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
    if (document.getElementById(TOGGLE_ID)) {
      return;
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
  };

  const startObserver = () => {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'childList') {
          return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
        }

        return mutation.type === 'attributes';
      });

      if (relevant) {
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

    mountToggleButton();
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
    document.addEventListener('DOMContentLoaded', () => {
      init();
    });
  } else {
    init();
  }
})();
