# MeMail

MeMail is a Chrome extension for Gmail that adds a smart **"✦ MeMail"** button to the reply experience.  
It reads the current email context and generates a polished reply using OpenAI so your response sounds natural and personal.

## What MeMail Does

- Injects a `✦ MeMail` button into Gmail's reply compose UI
- Reads the current email's subject, sender, and latest visible message body
- Detects your Gmail display name for sign-off
- Generates a concise reply using OpenAI `gpt-4o`
- Inserts the generated reply directly into the active compose box

## Install (Load Unpacked)

1. Download or clone this project.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this extension folder (`memail`).

## Add Your OpenAI API Key

1. Click the MeMail extension icon in Chrome.
2. Enter your API key in the **OpenAI API Key** field.
3. Click **Save Key**.

The key is stored using `chrome.storage.local` under `openai_api_key`.

## How To Use In Gmail

1. Open Gmail and open any email thread.
2. Click Reply so the compose box is visible.
3. Click the `✦ MeMail` button in the reply toolbar.
4. Wait for generation to complete.
5. Review the inserted draft and click Send.

## Security Note

The API key is stored in Chrome's local extension storage via the popup settings page.  
It is never hardcoded. Do not commit any file containing your actual key.
