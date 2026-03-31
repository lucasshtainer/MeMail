(() => {
  const BUTTON_ID = "memail-btn";
  const BUTTON_CLASS = "memail-btn";
  const LOADING_CLASS = "memail-loading";
  const SUCCESS_CLASS = "memail-success";

  const SELECTORS = {
    composeBox: '[aria-label="Message Body"]',
    subject: "h2.hP, .hP",
    sender: ".gD, .go",
    body: ".a3s.aiL, .ii.gt",
    accountButton: '.gb_d, [aria-label*="Google Account"]'
  };

  function getActiveComposeBox() {
    const boxes = Array.from(document.querySelectorAll(SELECTORS.composeBox));
    if (!boxes.length) {
      return null;
    }

    const visible = boxes.find((box) => box.offsetParent !== null);
    return visible || boxes[boxes.length - 1];
  }

  function findComposeToolbar(composeBox) {
    if (!composeBox) {
      return null;
    }

    const composeRoot = composeBox.closest('[role="dialog"], .M9, .AD') || composeBox.parentElement;
    if (!composeRoot) {
      return null;
    }

    return (
      composeRoot.querySelector('[role="toolbar"]') ||
      composeRoot.querySelector(".btC") ||
      composeRoot.querySelector(".dC")
    );
  }

  function extractSubject() {
    const subjectEl = document.querySelector(SELECTORS.subject);
    return (subjectEl?.textContent || "").trim() || "(No subject)";
  }

  function extractSender() {
    const senderEl = document.querySelector(SELECTORS.sender);
    return (
      senderEl?.getAttribute("email") ||
      senderEl?.getAttribute("name") ||
      senderEl?.textContent ||
      "Unknown sender"
    ).trim();
  }

  function extractEmailBody() {
    const bodies = Array.from(document.querySelectorAll(SELECTORS.body)).filter(
      (node) => node.offsetParent !== null
    );
    if (!bodies.length) {
      return "";
    }

    const latestBody = bodies[bodies.length - 1];
    return (latestBody.innerText || latestBody.textContent || "").trim();
  }

  function extractUserName() {
    const accountEl = document.querySelector(SELECTORS.accountButton);
    if (!accountEl) {
      return "Me";
    }

    const aria = accountEl.getAttribute("aria-label") || "";
    const trimmed = aria.trim();
    if (trimmed) {
      const firstPart = trimmed.split("\n")[0].trim();
      if (firstPart && !firstPart.toLowerCase().includes("google account")) {
        return firstPart;
      }
    }

    const text = (accountEl.textContent || "").trim();
    return text || "Me";
  }

  function setComposeText(composeBox, text) {
    composeBox.innerHTML = "";
    composeBox.innerText = text;
    composeBox.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setButtonState(button, { loading = false, success = false, text = "✦ MeMail" } = {}) {
    button.textContent = text;
    button.classList.toggle(LOADING_CLASS, loading);
    button.classList.toggle(SUCCESS_CLASS, success);
    button.disabled = loading;
  }

  function showInlineMessage(composeBox, message) {
    if (!composeBox) {
      alert(message);
      return;
    }

    const existing = composeBox.parentElement?.querySelector(".memail-inline-status");
    if (existing) {
      existing.remove();
    }

    const status = document.createElement("div");
    status.className = "memail-inline-status";
    status.textContent = message;
    composeBox.parentElement?.appendChild(status);

    window.setTimeout(() => {
      status.remove();
    }, 4000);
  }

  async function readApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["openai_api_key"], (result) => {
        resolve(result.openai_api_key || "");
      });
    });
  }

  async function generateReply({ subject, sender, emailBody, userName, apiKey }) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant that writes email replies on behalf of the user.\n" +
              "Write in a natural, human, professional-but-warm tone that sounds like a real person - not corporate or robotic.\n" +
              "Match the formality level of the original email.\n" +
              "Keep replies concise and clear. Do not add unnecessary padding or filler.\n" +
              "Sign off with the user's name provided.\n" +
              "Only return the email reply body - no subject line, no metadata."
          },
          {
            role: "user",
            content:
              `My name is ${userName}.\n` +
              "I received the following email:\n\n" +
              `Subject: ${subject}\n` +
              `From: ${sender}\n\n` +
              `${emailBody}\n\n` +
              `Write a reply from me (${userName}) that sounds natural and matches how I'd typically respond.`
          }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || "";
      const lowerMsg = msg.toLowerCase();

      if (response.status === 429 || lowerMsg.includes("rate limit")) {
        throw new Error("RATE_LIMIT");
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("API_KEY");
      }
      throw new Error("GENERIC");
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || "";
  }

  async function onMeMailClick(button) {
    const composeBox = getActiveComposeBox();
    if (!composeBox) {
      alert("Please open a reply compose box first");
      return;
    }

    setButtonState(button, { loading: true, text: "Thinking like you..." });

    try {
      const apiKey = await readApiKey();
      if (!apiKey) {
        showInlineMessage(
          composeBox,
          "Please add your API key in the MeMail settings (click the extension icon)."
        );
        setButtonState(button);
        return;
      }

      const subject = extractSubject();
      const sender = extractSender();
      const emailBody = extractEmailBody();
      const userName = extractUserName();

      if (!emailBody) {
        showInlineMessage(composeBox, "Couldn't read this email. Try opening the latest message first.");
        setButtonState(button);
        return;
      }

      const reply = await generateReply({ subject, sender, emailBody, userName, apiKey });

      if (!reply) {
        showInlineMessage(composeBox, "Couldn't generate reply. Check your API key.");
        setButtonState(button);
        return;
      }

      setComposeText(composeBox, reply);
      setButtonState(button, { success: true, text: "✦ Done!" });
      window.setTimeout(() => {
        setButtonState(button);
      }, 2000);
    } catch (error) {
      if (error.message === "RATE_LIMIT") {
        showInlineMessage(composeBox, "OpenAI rate limit reached. Try again in a moment.");
      } else {
        showInlineMessage(composeBox, "Couldn't generate reply. Check your API key.");
      }
      setButtonState(button);
    }
  }

  function ensureButton() {
    const composeBox = getActiveComposeBox();
    if (!composeBox) {
      return;
    }

    const toolbar = findComposeToolbar(composeBox);
    if (!toolbar) {
      return;
    }

    if (toolbar.querySelector(`#${BUTTON_ID}`) || document.getElementById(BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = BUTTON_CLASS;
    button.type = "button";
    button.textContent = "✦ MeMail";
    button.addEventListener("click", () => onMeMailClick(button));
    toolbar.appendChild(button);
  }

  const observer = new MutationObserver(() => {
    ensureButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  ensureButton();
})();
