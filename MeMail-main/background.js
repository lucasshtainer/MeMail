const WEEKLY_ALARM = "weeklyRelearn";
const ONBOARDING_URL = chrome.runtime.getURL("onboarding.html");
const OAUTH_CLIENT_ID = chrome.runtime.getManifest().oauth2?.client_id || "";

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: ONBOARDING_URL });
  chrome.alarms.create(WEEKLY_ALARM, { periodInMinutes: 10080 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(WEEKLY_ALARM, { periodInMinutes: 10080 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== WEEKLY_ALARM) {
    return;
  }

  runLearningFlow({ interactive: false }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }
  if (changes.onboardingComplete?.newValue === true) {
    runLearningFlow({ interactive: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "MEMAIL_START_RELEARN") {
    runLearningFlow({ interactive: true })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Unknown error" }));
    return true;
  }

  if (message?.type === "MEMAIL_REAUTHORIZE_GMAIL") {
    runLearningFlow({ interactive: true, forceRefreshToken: true })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Unknown error" }));
    return true;
  }

  if (message?.type === "MEMAIL_OPEN_ONBOARDING_STEP4") {
    chrome.tabs.create({ url: `${ONBOARDING_URL}#step=4` });
    sendResponse({ ok: true });
    return;
  }
});

async function runLearningFlow({ interactive, forceRefreshToken = false }) {
  if (!OAUTH_CLIENT_ID || OAUTH_CLIENT_ID === "REPLACE_WITH_YOUR_OAUTH_CLIENT_ID") {
    const error =
      "OAuth client ID is not configured. Add your real oauth2.client_id in manifest.json, reload extension, then re-authorise.";
    await chrome.storage.local.set({ lastLearnError: error });
    return { ok: false, error, needsAuth: true };
  }

  const storage = await chrome.storage.local.get(["aiProvider", "apiKeys"]);
  const provider = storage.aiProvider;
  const apiKeys = storage.apiKeys || {};
  const apiKey = provider ? apiKeys[provider] : "";

  if (!provider || !apiKey) {
    const error = "Please set up your API key first (click the MeMail icon)";
    await chrome.storage.local.set({ lastLearnError: error });
    return { ok: false, error };
  }

  let tokenResult = await getAuthToken(interactive);
  let token = tokenResult.token;
  if (!token) {
    const error = tokenResult.error || "Gmail access needed. Click here to re-authorise.";
    await chrome.storage.local.set({ lastLearnError: error });
    return { ok: false, error, needsAuth: true };
  }

  if (forceRefreshToken) {
    await removeCachedToken(token);
    tokenResult = await getAuthToken(true);
    token = tokenResult.token;
    if (!token) {
      const error = tokenResult.error || "Gmail access needed. Click here to re-authorise.";
      await chrome.storage.local.set({ lastLearnError: error });
      return { ok: false, error, needsAuth: true };
    }
  }

  let listRes = await fetchSentMessageIds(token);
  if (listRes.status === 401 || listRes.status === 403) {
    await removeCachedToken(token);
    tokenResult = await getAuthToken(true);
    token = tokenResult.token;
    if (!token) {
      const error = tokenResult.error || "Gmail access needed. Click here to re-authorise.";
      await chrome.storage.local.set({ lastLearnError: error });
      return { ok: false, error, needsAuth: true };
    }
    listRes = await fetchSentMessageIds(token);
  }

  if (!listRes.ok) {
    if (listRes.status === 401 || listRes.status === 403) {
      const error = "Gmail access needed. Click here to re-authorise.";
      await chrome.storage.local.set({ lastLearnError: error });
      return { ok: false, error, needsAuth: true };
    }
    const error = await responseErrorMessage(listRes, "Failed to read Gmail sent messages.");
    await chrome.storage.local.set({ lastLearnError: error });
    return { ok: false, error };
  }

  const listData = await listRes.json();
  const messages = listData.messages || [];
  if (!messages.length) {
    const error = "No sent emails found to learn from.";
    await chrome.storage.local.set({ lastLearnError: error });
    return { ok: false, error };
  }

  const bodies = [];
  for (const item of messages) {
    const detailRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!detailRes.ok) {
      continue;
    }
    const detail = await detailRes.json();
    const plain = extractPlainTextBody(detail.payload);
    if (plain) {
      bodies.push(plain);
    }
  }

  if (!bodies.length) {
    const error = "No sent emails found to learn from.";
    await chrome.storage.local.set({ lastLearnError: error });
    return { ok: false, error };
  }

  const combinedText = bodies.join("\n\n---\n\n");
  const summaryResult = await requestStyleSummaryFromContent({ provider, apiKey, combinedText });
  if (!summaryResult.ok) {
    await chrome.storage.local.set({ lastLearnError: summaryResult.error });
    return summaryResult;
  }

  await chrome.storage.local.set({
    styleProfile: summaryResult.styleProfile,
    lastLearnedAt: Date.now(),
    lastLearnError: ""
  });

  return { ok: true };
}

function getAuthToken(interactive) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        resolve({
          token: "",
          error: `Gmail auth failed: ${chrome.runtime.lastError.message}`
        });
        return;
      }
      resolve({ token: token || "", error: "" });
    });
  });
}

function fetchSentMessageIds(token) {
  return fetch("https://www.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=100", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function requestStyleSummaryFromContent({ provider, apiKey, combinedText }) {
  const tabs = await chrome.tabs.query({ url: "https://mail.google.com/*" });
  if (!tabs.length) {
    return {
      ok: false,
      error: "Open Gmail to finish learning your style."
    };
  }

  for (const tab of tabs) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "MEMAIL_SUMMARIZE_STYLE",
        payload: { provider, apiKey, combinedText }
      });
      if (response?.ok) {
        return response;
      }
    } catch (error) {
      // Continue trying other Gmail tabs.
    }
  }

  return {
    ok: false,
    error: "Open Gmail to finish learning your style."
  };
}

function extractPlainTextBody(payload) {
  if (!payload) {
    return "";
  }

  const partText = decodeBody(payload.body?.data);
  if (partText) {
    return partText;
  }

  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain") {
      const txt = decodeBody(part.body?.data);
      if (txt) {
        return txt;
      }
    }
  }

  for (const part of parts) {
    const nested = extractPlainTextBody(part);
    if (nested) {
      return nested;
    }
  }

  return "";
}

function decodeBody(data) {
  if (!data) {
    return "";
  }
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(normalized), (c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
  } catch (error) {
    try {
      return atob(normalized);
    } catch (decodeError) {
      return "";
    }
  }
}

async function responseErrorMessage(response, fallback) {
  const data = await response.json().catch(() => ({}));
  return data?.error?.message || fallback;
}
