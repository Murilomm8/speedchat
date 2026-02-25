chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    speedchatEnabled: true,
    speedchatUltraMode: false
  };

  const result = await chrome.storage.local.get(defaults);
  const updates = {};

  if (typeof result.speedchatEnabled !== 'boolean') {
    updates.speedchatEnabled = defaults.speedchatEnabled;
  }

  if (typeof result.speedchatUltraMode !== 'boolean') {
    updates.speedchatUltraMode = defaults.speedchatUltraMode;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  // TODO: Pro Feature – smart search
  // TODO: Pro Feature – instant export
  // TODO: Pro Feature – AI message tagging
});
