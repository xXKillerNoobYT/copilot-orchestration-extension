# Troubleshooting Guide

This document covers common issues and their solutions.

## Node.js Deprecation and Experimental Warnings

### `DEP0040: punycode module is deprecated`

**What it is**: This warning appears in the output/logs during extension startup.

**Root cause**: The `uri-js` dependency (used by transitive dependencies) uses the deprecated Node.js `punycode` module for URL parsing. This is expected and safe.

**Status**: ✅ **FIXED** - As of Feb 6, 2026, the extension now suppresses this warning automatically in `src/extension.ts` via the `suppressExpectedNodeWarnings()` function.

**If you still see it**: Your compiled output might be outdated. Run:
```bash
npm run compile
```

---

### `ExperimentalWarning: SQLite is an experimental feature`

**What it is**: Warning about Node.js's built-in SQLite module being experimental.

**Root cause**: The extension uses `sqlite3` npm package, which internally uses Node 22.17.0+'s experimental SQLite API.

**Status**: ✅ **FIXED** - Suppressed automatically since Feb 6, 2026 (same fix as above).

**Why we suppress it**: 
- This is a Node.js core feature warning, not an error in our code
- SQLite3 package is production-ready despite using an experimental API
- Suppression keeps extension logs clean and readable

---

## Port Conflicts

### `Error: listen EADDRINUSE: address already in use 127.0.0.1:5000`

**What it is**: Some extension or service is trying to listen on port 5000, but it's already in use.

**Root cause**: **NOT from COE** - This error typically comes from other extensions (e.g., GitHub Issues Sync, Live Server, etc.) or background services.

**Diagnosis**:
1. The COE extension uses **stdio (stdin/stdout) for MCP communication**, not HTTP ports
2. If you see this error alongside COE logs, it's from another component
3. Check which extensions are running in VS Code Extensions sidebar

**Solutions**:

**Option A: Find and kill the process using port 5000**
```powershell
# Windows - find process using port 5000
netstat -ano | findstr :5000
# Kill the process (replace PID)
taskkill /PID <PID> /F
```

```bash
# macOS/Linux
lsof -i :5000
kill -9 <PID>
```

**Option B: Disable conflicting extensions**
1. Open VS Code Extensions sidebar (Ctrl+Shift+X)
2. Find "GitHub Issues Sync", "Live Server", or similar
3. Click "Disable for Workspace" on the conflicting extension
4. Reload VS Code

**Option C: Change the conflicting service's port**
- If it's a VS Code extension, check its settings for `port` configuration
- Some extensions let you specify alternative ports

---

## Extension Activation Issues

### Extension is slow to activate or hangs

**Check these in order**:

1. **Is LLM service running?**
   - COE waits for LLM connection during activation
   - Make sure LM Studio server is running (default: http://127.0.0.1:1234/v1)
   - Check `.coe/config.json` endpoint matches your setup

2. **Database locked?**
   - Close all other instances of VS Code with this workspace
   - Delete `.coe/tickets.db` if it's corrupted
   - Restart VS Code

3. **Check Extension Terminal**
   - Open: View → Output → Select "Copilot Orchestration Extension"
   - Look for ERROR or WARN messages
   - Post errors here with `[timestamp]` prefixes

---

## Configuration Issues

###  `Config loaded successfully. Using default configuration`

**Meaning**: `.coe/config.json` was missing, so defaults loaded.

**To fix**: Create `.coe/config.json` in your workspace root:
```json
{
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1",
    "model": "mistralai/ministral-3-14b-reasoning",
    "timeoutSeconds": 60,
    "maxTokens": 2048
  }
}
```

See [LM-STUDIO-SETUP.md](Docs/LM-STUDIO-SETUP.md) for full configuration options.

---

## Database Issues

### `Ticket DB initialized: SQLite at <path>/.coe/tickets.db`

**What it means**: Database initialized successfully. The path shown is where tickets are stored (SQLite format).

**If database is corrupted**:
```bash
# Delete database - it will be recreated on next activation
rm ".coe/tickets.db"
```

---

## MCP Server Issues

### `MCP server started successfully` but no tools registered

**Check**:
1. Look for `MCP registered tools:` line in logs
2. Should show: `getNextTask, reportTaskDone, askQuestion, getErrors`
3. If missing tools, extension may not have fully activated

**Fix**: Reload VS Code (Cmd/Ctrl+R)

---

## Logging & Debugging

### View Extension Logs

1. **Output Panel** (easiest):
   - Press `Ctrl+Shift+U` (Windows/Linux) or `Cmd+Shift+U` (macOS)
   - Select "Copilot Orchestration Extension" from dropdown

2. **Debug Console** (if using debugger):
   - Press `Ctrl+Shift+D` to open Run & Debug
   - Select "Extension" configuration
   - Logs appear in Debug Console

### Extract logs from file

Linux/macOS:
```bash
# Find VS Code extensions folder
grep "Copilot Orchestration" ~/.config/Code/logs/*/exthost/*.log
```

Windows:
```cmd
# Look in AppData
dir %APPDATA%\Code\logs
```

---

## Still Having Issues?

1. **Check git status** - Ensure you're on latest `main` branch
   ```bash
   git status
   git pull origin main
   npm install
   npm run compile
   ```

2. **Clear cache and reinstall**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run compile
   ```

3. **Report the issue**:
   - Include logs from Output panel (timestamp + error)
   - Include `.coe/config.json` (redact any secrets)
   - Describe what you were doing when it happened
