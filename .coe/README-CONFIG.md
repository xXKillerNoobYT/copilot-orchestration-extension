# COE Configuration Guide

## LLM Configuration (`.coe/config.json`)

All LLM settings are configured in `.coe/config.json` under the `llm` section.

### Available LLM Settings

```json
{
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 900,
    "startupTimeoutSeconds": 300,
    "maxTokens": 2048
  }
}
```

### Settings Explained

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `endpoint` | string | `http://192.168.1.205:1234/v1` | LM Studio server URL. Change IP to your LM Studio machine, or use `127.0.0.1` for localhost |
| `model` | string | `ministral-3-14b-reasoning` | Model name loaded in LM Studio (must match exactly) |
| `timeoutSeconds` | number | 900 | Maximum seconds to wait for LLM response (900 = 15 minutes) |
| `startupTimeoutSeconds` | number | 300 | Maximum seconds to wait for streaming to start (300 = 5 minutes) |
| `maxTokens` | number | 2048 | Maximum tokens in LLM response (higher = longer responses but slower) |

---

## How Settings Are Loaded

1. **Extension starts** → `initializeLLMService()` is called
2. **Reads** `.coe/config.json` from your workspace
3. **Merges** with defaults (uses defaults if config missing)
4. **Validates** each setting (logs warnings if invalid)
5. **Uses** these settings for all LLM requests

**Code location**: `src/services/llmService.ts` lines 195-245

---

## Troubleshooting LLM Connection

### Error: `fetch failed`

**Cause**: Cannot connect to LM Studio server at configured endpoint.

**Solutions**:

1. **Check LM Studio is running**:
   - Open LM Studio on the machine at `192.168.1.205`
   - Click "Local Server" tab
   - Click **"Start Server"**
   - Should show: `Server is listening at http://192.168.1.205:1234`

2. **Verify model is loaded**:
   - LM Studio → "My Models" tab
   - Load `ministral-3-14b-reasoning` (or update `config.json` to match your model name)

3. **Test connection**:
   ```powershell
   # From your Windows machine:
   curl http://192.168.1.205:1234/v1/models
   ```
   Should return JSON with model list.

4. **Check firewall**:
   - LM Studio machine must allow port `1234` incoming connections
   - Windows Firewall → Allow port 1234 TCP

5. **Network connectivity**:
   ```powershell
   ping 192.168.1.205
   ```
   Should succeed. If not, check network/IP address.

### Error: `timeout`

**Cause**: LLM is responding but too slowly.

**Solutions**:
- Increase `timeoutSeconds` in config.json (already set to 900 = 15 min)
- Use a faster model
- Check CPU/GPU load on LM Studio machine

### Using Localhost

If LM Studio is on the **same machine** as VS Code:

```json
{
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1",
    ...
  }
}
```

---

## Verifying Configuration is Loaded

Check VS Code **Output** panel → **"COE Logs"**:

Should see on extension activation:
```
[INFO] LLM service initialized: http://192.168.1.205:1234/v1 (model: ministral-3-14b-reasoning)
```

If you see warnings about invalid settings, they're being replaced with defaults.

---

## Testing LLM Integration

1. **Start a new conversation**:
   - COE sidebar → Conversations tab
   - Click "➕ New Conversation"
   - Type a message and press Enter

2. **Check logs**:
   - Output panel → "COE Logs"
   - Should see: `LLM streaming started: ...`
   - If successful: streaming chunks appear
   - If failed: `[ERROR] ... fetch failed`

3. **Successful response**:
   - Message appears in webview chat
   - No errors in logs

---

## Config File Priority

1. **User config** (`.coe/config.json`) - highest priority
2. **Default config** (hardcoded in `llmService.ts`) - fallback

**File must exist**: Yes, create `.coe/config.json` in your workspace root.

---

## Example Configurations

### Local Development (LM Studio on same machine)
```json
{
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 300,
    "startupTimeoutSeconds": 120,
    "maxTokens": 4096
  }
}
```

### Remote LM Studio (different machine on network)
```json
{
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 900,
    "startupTimeoutSeconds": 300,
    "maxTokens": 2048
  }
}
```

### Fast responses (smaller model, lower timeout)
```json
{
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1",
    "model": "qwen2.5-3b-instruct",
    "timeoutSeconds": 60,
    "startupTimeoutSeconds": 30,
    "maxTokens": 1024
  }
}
```

---

## Next Steps

1. ✅ **Config is set up** - your `.coe/config.json` has all required LLM settings
2. 🔧 **Start LM Studio** on `192.168.1.205` machine
3. ▶️ **Start Server** in LM Studio
4. 🔄 **Reload VS Code** window (`Ctrl+Shift+P` → "Reload Window")
5. 💬 **Test conversation** in COE sidebar

All LLM settings are now properly configured and will be used automatically! 🎉
