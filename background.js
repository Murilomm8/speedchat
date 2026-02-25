chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get({ speedchatEnabled: true });

  if (typeof result.speedchatEnabled !== 'boolean') {
    await chrome.storage.local.set({ speedchatEnabled: true });
  }

  // TODO: Pro Feature – smart search
  // TODO: Pro Feature – instant export
  // TODO: Pro Feature – AI message tagging
});
