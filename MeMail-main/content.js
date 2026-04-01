(() => {
  const BUTTON_ID = "memail-btn";
  const SPIN_CLASS = "memail-spinning";

  const PROVIDER_MODELS = {
    openai: "gpt-4o",
    gemini: "gemini-1.5-pro",
    anthropic: "claude-3-5-sonnet-20241022",
    deepseek: "deepseek-chat"
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "MEMAIL_SUMMARIZE_STYLE") {
      summarizeStyle(message.payload)
        .then((styleProfile) => sendResponse({ ok: true, styleProfile }))
        .catch((error) => sendResponse({ ok: false, error: error.message || "Style learning failed." }));
      return true;
    }
  });

  function getActiveComposeBox() {
    const boxes = Array.from(document.querySelectorAll('[aria-label="Message Body"]'));
    const visible = boxes.filter((box) => box.offsetParent !== null);
    return visible[visible.length - 1] || boxes[boxes.length - 1] || null;
  }

  function findComposeToolbar(composeBox) {
    const root = composeBox?.closest('[role="dialog"], .M9, .AD') || composeBox?.parentElement;
    if (!root) {
      return null;
    }
    return root.querySelector('[role="toolbar"], .btC, .dC');
  }

  function showInlineMessage(message) {
    const composeBox = getActiveComposeBox();
    if (!composeBox) {
      return;
    }
    const parent = composeBox.parentElement;
    if (!parent) {
      return;
    }
    const old = parent.querySelector(".memail-inline-status");
    if (old) {
      old.remove();
    }
    const div = document.createElement("div");
    div.className = "memail-inline-status";
    div.textContent = message;
    parent.appendChild(div);
    window.setTimeout(() => div.remove(), 5000);
  }

  function extractThreadData() {
    const subject =
      (document.querySelector("h2.hP, .hP")?.textContent || "").trim() || "(No subject)";

    const messageRoots = Array.from(document.querySelectorAll(".adn.ads, .h7, .ii.gt"))
      .filter((el) => el.offsetParent !== null)
      .filter((el, idx, arr) => arr.indexOf(el) === idx);

    const entries = [];
    for (const root of messageRoots) {
      const senderEl = root.querySelector(".gD, .go, [email]");
      const senderName = (senderEl?.getAttribute("name") || senderEl?.textContent || "").trim();
      const senderEmail = (senderEl?.getAttribute("email") || "").trim();
      const timestampEl = root.querySelector(".g3, [title][role='gridcell']");
      const timestamp = (timestampEl?.getAttribute("title") || timestampEl?.textContent || "").trim();
      const bodyEl = root.querySelector(".a3s.aiL, .ii.gt");
      const body = (bodyEl?.innerText || bodyEl?.textContent || "").trim();
      if (!body) {
        continue;
      }
      entries.push({
        senderName: senderName || "Unknown sender",
        senderEmail: senderEmail || "unknown@email",
        timestamp: timestamp || "Unknown time",
        body
      });
    }

    if (!entries.length) {
      const fallbackBodies = Array.from(document.querySelectorAll(".a3s.aiL, .ii.gt")).filter(
        (el) => el.offsetParent !== null && (el.innerText || el.textContent || "").trim()
      );
      fallbackBodies.forEach((el) => {
        entries.push({
          senderName: "Unknown sender",
          senderEmail: "unknown@email",
          timestamp: "Unknown time",
          body: (el.innerText || el.textContent || "").trim()
        });
      });
    }

    const fullThread = entries
      .map(
        (msg, idx) =>
          `${idx + 1}. ${msg.senderName} <${msg.senderEmail}> at ${msg.timestamp}\n${msg.body}`
      )
      .join("\n\n---\n\n");

    const latest = entries[entries.length - 1];
    return {
      subject,
      entries,
      fullThread,
      latestBody: latest?.body || "",
      senderList: entries.map((e) => `${e.senderName} <${e.senderEmail}>`).join(", ")
    };
  }

  function setComposeText(text) {
    const composeBox = getActiveComposeBox();
    if (!composeBox) {
      throw new Error("Please open a reply compose box first.");
    }
    composeBox.innerHTML = "";
    composeBox.innerText = text;
    composeBox.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function getConfig() {
    return chrome.storage.local.get(["aiProvider", "apiKeys", "styleProfile", "lastLearnError"]);
  }

  async function callProvider({ provider, apiKey, systemPrompt, userPrompt, temperature = 0.4 }) {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: PROVIDER_MODELS.openai,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });
      return parseOpenAIResponse(res);
    }

    if (provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: PROVIDER_MODELS.deepseek,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });
      return parseOpenAIResponse(res);
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: PROVIDER_MODELS.anthropic,
          max_tokens: 800,
          temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        })
      });
      if (!res.ok) {
        throw new Error(await extractError(res));
      }
      const data = await res.json();
      return (data?.content?.[0]?.text || "").trim();
    }

    if (provider === "gemini") {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDER_MODELS.gemini}` +
        `:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }
          ],
          generationConfig: { temperature }
        })
      });
      if (!res.ok) {
        throw new Error(await extractError(res));
      }
      const data = await res.json();
      return (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    }

    throw new Error("Unsupported AI provider selected.");
  }

  async function parseOpenAIResponse(res) {
    if (!res.ok) {
      throw new Error(await extractError(res));
    }
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || "").trim();
  }

  async function extractError(response) {
    const data = await response.json().catch(() => ({}));
    return data?.error?.message || `Request failed (${response.status})`;
  }

  async function detectQuestions({ provider, apiKey, latestBody }) {
    const prompt =
      "Read this email and identify any specific questions or requests that require a personal answer " +
      "from the recipient (such as a time, date, preference, number, location, or personal detail). " +
      "Return them as a JSON array of objects: [{ \"question\": \"What time works for you?\", \"placeholder\": " +
      "\"e.g. 3pm Tuesday\" }]. If there are none, return an empty array [].\n\n" +
      latestBody;
    const raw = await callProvider({
      provider,
      apiKey,
      systemPrompt: "You detect required personal-response questions in emails.",
      userPrompt: prompt,
      temperature: 0
    });

    const clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        return parsed.filter((q) => q && typeof q.question === "string");
      }
    } catch (error) {
      return [];
    }
    return [];
  }

  function showQuestionModal(questions) {
    return new Promise((resolve) => {
      const existing = document.querySelector(".memail-modal-overlay");
      if (existing) {
        existing.remove();
      }

      const overlay = document.createElement("div");
      overlay.className = "memail-modal-overlay";

      const modal = document.createElement("div");
      modal.className = "memail-modal";
      modal.innerHTML =
        '<h3>A few things to fill in first</h3>' +
        "<p>The email has some specific questions. Add your answers and MeMail will include them.</p>";

      questions.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "memail-question-row";
        const label = document.createElement("label");
        label.textContent = item.question;
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = item.placeholder || "Type your answer";
        input.dataset.questionIndex = String(idx);
        row.appendChild(label);
        row.appendChild(input);
        modal.appendChild(row);
      });

      const actions = document.createElement("div");
      actions.className = "memail-modal-actions";
      const generateBtn = document.createElement("button");
      generateBtn.className = "memail-modal-generate";
      generateBtn.type = "button";
      generateBtn.textContent = "Generate Reply";
      const skipBtn = document.createElement("button");
      skipBtn.className = "memail-modal-skip";
      skipBtn.type = "button";
      skipBtn.textContent = "Skip";
      actions.appendChild(generateBtn);
      actions.appendChild(skipBtn);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      generateBtn.addEventListener("click", () => {
        const answers = {};
        modal.querySelectorAll("input").forEach((input, idx) => {
          const val = input.value.trim();
          if (val) {
            answers[questions[idx].question] = val;
          }
        });
        overlay.remove();
        resolve(answers);
      });

      skipBtn.addEventListener("click", () => {
        overlay.remove();
        resolve(null);
      });
    });
  }

  async function summarizeStyle(payload) {
    const { provider, apiKey, combinedText } = payload || {};
    if (!provider || !apiKey || !combinedText) {
      throw new Error("Missing provider config for style learning.");
    }

    const systemPrompt =
      "You are analysing a person's writing style based on their last 100 sent emails.\n" +
      "Summarise their writing patterns in bullet points. Include:\n" +
      "- Tone (formal, casual, warm, blunt, etc.)\n" +
      "- Common phrases or words they use often\n" +
      "- How they open and close emails\n" +
      "- Their typical email length (short, medium, long)\n" +
      "- Any distinctive habits (e.g. uses \"bro\", signs off with \"Cheers\", uses exclamation marks a lot, etc.)\n" +
      "- How they handle different email types (requests, updates, replies)\n" +
      "Be specific. These bullet points will be used to generate future email replies that match their style exactly.";

    return callProvider({
      provider,
      apiKey,
      systemPrompt,
      userPrompt: combinedText,
      temperature: 0.2
    });
  }

  async function generateReplyFlow(button) {
    const composeBox = getActiveComposeBox();
    if (!composeBox) {
      showInlineMessage("Please open a reply compose box first.");
      return;
    }

    button.classList.add(SPIN_CLASS);
    try {
      const { aiProvider, apiKeys, styleProfile, lastLearnError } = await getConfig();
      const apiKey = apiKeys?.[aiProvider || ""];
      if (!aiProvider || !apiKey) {
        showInlineMessage("Please set up your API key first (click the MeMail icon)");
        return;
      }

      if (lastLearnError) {
        showInlineMessage(lastLearnError);
      }

      const thread = extractThreadData();
      if (!thread.latestBody) {
        showInlineMessage("Please open a reply compose box first.");
        return;
      }

      const detected = await detectQuestions({
        provider: aiProvider,
        apiKey,
        latestBody: thread.latestBody
      });

      let answers = null;
      if (detected.length) {
        answers = await showQuestionModal(detected);
      }

      const finalPrompt =
        "You are writing an email reply on behalf of the user.\n\n" +
        `USER'S WRITING STYLE PROFILE:\n${styleProfile || "No profile available yet."}\n\n` +
        `EMAIL THREAD (full context, oldest to newest):\n${thread.fullThread}\n\n` +
        `SPECIFIC ANSWERS TO INCLUDE:\n${
          answers && Object.keys(answers).length ? JSON.stringify(answers, null, 2) : "None provided"
        }\n\n` +
        "Write a reply to the most recent email in this thread. Match the user's writing style exactly " +
        "as described in the style profile. Keep it natural. Do not add unnecessary filler. " +
        "Only return the reply body - no subject line, no metadata.";

      const reply = await callProvider({
        provider: aiProvider,
        apiKey,
        systemPrompt: "You write natural email replies in the user's exact style.",
        userPrompt: finalPrompt,
        temperature: 0.45
      });

      if (!reply) {
        showInlineMessage("API error: Empty response. Check your key in MeMail settings.");
        return;
      }
      setComposeText(reply);
    } catch (error) {
      showInlineMessage(`API error: ${error.message}. Check your key in MeMail settings.`);
    } finally {
      button.classList.remove(SPIN_CLASS);
    }
  }

  function ensureButton() {
    const compose = getActiveComposeBox();
    if (!compose) {
      return;
    }
    const toolbar = findComposeToolbar(compose);
    if (!toolbar) {
      return;
    }
    if (toolbar.querySelector(`#${BUTTON_ID}`) || document.getElementById(BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "memail-btn";
    button.type = "button";
    button.title = "Generate reply with MeMail";

    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("icons/icon128.png");
    img.alt = "MeMail";
    img.className = "memail-btn-icon";
    button.appendChild(img);

    button.addEventListener("click", () => generateReplyFlow(button));
    toolbar.appendChild(button);
  }

  const observer = new MutationObserver(() => ensureButton());
  observer.observe(document.body, { childList: true, subtree: true });
  ensureButton();
})();
