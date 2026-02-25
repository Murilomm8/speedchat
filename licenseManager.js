(() => {
  const STORAGE_KEYS = {
    trialStart: 'trialStart',
    proUnlocked: 'proUnlocked',
    licenseKey: 'licenseKey'
  };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const TRIAL_DAYS = 7;

  const normalizeKey = (key) => String(key || '').trim().toUpperCase();

  const ensureTrialStart = async () => {
    const now = Date.now();
    const data = await chrome.storage.local.get({ [STORAGE_KEYS.trialStart]: 0 });
    const existing = Number(data[STORAGE_KEYS.trialStart]);

    if (existing > 0) {
      return existing;
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.trialStart]: now });
    return now;
  };

  const getTrialInfo = async () => {
    const trialStart = await ensureTrialStart();
    const elapsed = Math.max(0, Date.now() - trialStart);
    const elapsedDays = Math.floor(elapsed / DAY_MS);
    const remainingDays = Math.max(0, TRIAL_DAYS - elapsedDays);
    const isActive = remainingDays > 0;

    return {
      trialStart,
      remainingDays,
      isActive
    };
  };

  const validateLicenseKey = (key) => {
    const normalized = normalizeKey(key);

    if (!normalized.startsWith('SPD-') || !normalized.endsWith('-PRO')) {
      return false;
    }

    if (normalized.length < 16 || normalized.length > 32) {
      return false;
    }

    const body = normalized.slice(4, -4).replace(/-/g, '');

    if (!/^[A-Z0-9]+$/.test(body) || body.length < 6) {
      return false;
    }

    const sum = body.split('').reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 3), 0);
    return sum % 7 === 0;
  };

  const unlockWithKey = async (key) => {
    const normalized = normalizeKey(key);
    const isValid = validateLicenseKey(normalized);

    if (!isValid) {
      return false;
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.proUnlocked]: true,
      [STORAGE_KEYS.licenseKey]: normalized
    });

    return true;
  };

  const getAppState = async () => {
    const data = await chrome.storage.local.get({ [STORAGE_KEYS.proUnlocked]: false });

    if (Boolean(data[STORAGE_KEYS.proUnlocked])) {
      return 'PRO';
    }

    const trial = await getTrialInfo();

    if (trial.isActive) {
      return 'TRIAL';
    }

    return 'BLOCKED';
  };

  globalThis.SpeedChatLicenseManager = {
    getAppState,
    validateLicenseKey,
    unlockWithKey,
    getTrialInfo
  };
})();
