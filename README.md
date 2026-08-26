# NHW Frankfurt Parking Monitor

Browser extension for Chrome and Firefox that monitors parking space listings on [nhw.de](https://www.nhw.de) in Frankfurt am Main and notifies you when listings change.

## Features

- Hourly automatic checks for listing updates
- Detects new listings, removals, and price changes
- Desktop notifications on changes
- Popup UI for manual checks and viewing current listings

## Install for Development

### Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `chrome/` directory

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** and select `firefox/manifest.json`

### Reload after changes

Run `bash sync.sh create` to symlink shared files into browser directories, then reload the extension.

## How it Works

The background script polls the NHW listing page hourly, parses listings with regex, and compares against previously stored data. Changes trigger desktop notifications.

## Project Structure

```
garage_check/
  background.js      # Shared service worker (alarm, fetch, parse, diff, notify)
  popup.html/js/css  # Shared popup UI
  icons/             # Extension icons
  chrome/            # Chrome manifest + symlinks
  firefox/           # Firefox manifest + symlinks
  sync.sh            # Create/remove symlinks for shared files
```
