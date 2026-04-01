# MeMail v2

MeMail v2 is a Gmail Chrome extension that learns your writing style from your last 100 sent emails and generates personalised replies inside Gmail.

## Core Features

- Guided onboarding with consent, provider education, key setup, and Gmail launch
- Multi-provider support: Gemini, OpenAI, Anthropic, and DeepSeek
- Style learning from the last 100 sent emails via Gmail API
- Weekly re-learning using Chrome alarms to keep style fresh
- Smart question detection for open-ended prompts before generating replies
- Full thread-aware reply generation (oldest to newest context)

## Architecture

- `background.js`
  - Opens onboarding tab on install
  - Authenticates with Gmail OAuth via `chrome.identity.getAuthToken`
  - Reads last 100 sent emails from Gmail API
  - Stores `lastLearnedAt`, `styleProfile`, and error state in `chrome.storage.local`
  - Schedules weekly re-learning with `chrome.alarms`
- `content.js`
  - Injects icon-only MeMail compose button
  - Reads full Gmail thread context
  - Detects open-ended questions and renders a fill-in modal
  - Routes AI requests to selected provider API
  - Injects generated response into active compose box
- `onboarding.html` + `onboarding.js`
  - Full step-based setup flow
  - Consent, tutorial links, provider selection, key management
- `popup.html` + `popup.js`
  - Shows active provider and saved keys
  - Opens key management at onboarding step 4
  - Triggers manual style re-learning

## Install (Load Unpacked)

1. Clone this repository.
2. Open Chrome at `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `MeMail-main` folder.

## OAuth Setup

1. Create a Chrome Extension OAuth Client in Google Cloud.
2. Set `oauth2.client_id` in `manifest.json`:
   - `REPLACE_WITH_YOUR_OAUTH_CLIENT_ID`
3. Ensure these scopes are enabled:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`

## First Run

1. Install extension.
2. Onboarding opens automatically.
3. Grant email-learning consent.
4. Save at least one provider API key.
5. Click **Done - Go to Gmail**.
6. MeMail learns style and stores profile locally.

## Data + Security

- API keys and learned style are stored in `chrome.storage.local`.
- No developer-controlled server is used.
- Gmail message reads happen through the user's own OAuth grant.
- Never hardcode real keys in source files.
