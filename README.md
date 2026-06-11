# Email Read Automate

Browser extension that automatically opens and reads unread emails one by one.

## Supported Providers

* Gmail
* Yahoo Mail
* AOL Mail
* Outlook
* Proton Mail
* Zoho Mail

## Installation

1. Download or clone this repository.
2. Open Chrome.
3. Navigate to chrome://extensions.
4. Enable Developer Mode.
5. Click "Load unpacked".
6. Select the extension folder.

## Features

* Detects unread emails
* Opens emails automatically
* Works with multiple email providers
* Lightweight Manifest V3 extension

## Disclaimer

Use responsibly and only on accounts you own or are authorized to access.


## Gmail Spam + Pagination Update

This build preserves the popup built-in automation templates and adds Gmail-specific mailbox traversal:

* Gmail Spam is checked first, then Gmail Inbox.
* Gmail pagination uses the Older/next-page button and continues until there is no next page or the configured max email limit is reached.
* Returning from an opened Gmail message goes back to the active mailbox page, so Spam processing stays in Spam and Inbox processing stays in Inbox.
* Existing template, reply, link-opening, processed-history, retry, random-opening, and account-switching settings are preserved.
