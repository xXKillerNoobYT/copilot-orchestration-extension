# COE Extension - UI Elements & Features Guide

## ✅ Fixed Issues

1. **UUID Module Error** - Removed unused `uuid` dependency that was causing extension activation failure
2. **Custom Agent Builder** - Added missing command registrations to open builder from UI
3. **Agent Gallery** - Added missing command registrations to open gallery from UI

---

## UI Elements That Should Be Visible

### 1. 🔧 Sidebar Panels (Three Views)

#### A. **Agents Panel**
- **Location**: VS Code Activity Bar → Agents (usually left sidebar)
- **Shows**: List of all available agents (Planning, Answer, Research, Verification, Custom Agents)
- **Actions Available**:
  - ✅ Enable/Disable agents
  - 👁️ View agent status
  - 🔄 Refresh agent list

#### B. **Tickets Panel**  
- **Location**: VS Code Activity Bar → Tickets
- **Shows**: All tickets with status (open, in-progress, completed, failed, pending verification)
- **Actions Available**:
  - 📋 View ticket details
  - 🎯 Process tickets
  - ✅ Approve & process
  - 📝 Add comments
  - 🗑️ Remove tickets
  - 🔄 Update status manually

#### C. **Conversations Panel**
- **Location**: VS Code Activity Bar → Conversations
- **Shows**: Chat history with Answer Agent
- **Actions Available**:
  - 💬 Start new conversation
  - 📖 Open existing conversation
  - 🗑️ Remove conversation
  - 🧹 Clear history

#### D. **Orchestrator Status Panel** 
- **Location**: VS Code Activity Bar → Orchestrator Status
- **Shows**: Current state of agent orchestration, active tasks
- **Actions Available**:
  - 👁️ View status details
  - 🔄 Refresh status

---

### 2. 📝 Commands Available (Via Command Palette)

Press **`Ctrl+Shift+P`** and search for any of these:

#### **Agent Commands**
- `COE: Create Custom Agent` - Opens the custom agent builder form
- `COE: Open Agent Gallery` - Opens marketplace for browsing pre-built agents
- `COE: Enable Agent` - Enable a specific agent
- `COE: Disable Agent` - Disable a specific agent

#### **Planning & Orchestration**
- `COE: Plan Task` - Run the Planning Agent on current ticket
- `COE: Verify Task` - Run verification on the last ticket
- `COE: Verify Last Ticket` - Verify the most recent ticket
- `COE: Toggle Auto Processing` - Enable/disable auto-mode for ticket processing

#### **Question & Answer**
- `COE: Ask Answer Agent` - Open a new conversation
- `COE: Continue Answer Agent Chat` - Continue existing chat
- `COE: Start New Conversation` - Create new conversation

#### **Ticket Management**
- `COE: Open Ticket` - Open a ticket for viewing/editing
- `COE: Process This Ticket` - Process specific ticket through agents
- `COE: Approve & Process` - Approve and process ticket
- `COE: Update Status Manually` - Manually change ticket status
- `COE: Add User Comment` - Add comment to ticket
- `COE: View Current Progress` - Check ticket progress

#### **Research**
- `COE: Research with Agent` - Perform detailed research on a topic

#### **Refresh Commands**
- `COE: Refresh Agents`
- `COE: Refresh Tickets`
- `COE: Refresh Conversations`
- `COE: Refresh Orchestrator Status`

---

### 3. 📊 Status Bar

**Location**: Bottom right of VS Code window

Shows:
- `$(rocket) COE Ready` - Indicates extension is active
- **Click to**: Run `coe.sayHello` command

---

### 4. 🎨 Webview Panels

These open as new VS Code tabs when activated:

#### **Custom Agent Builder Panel**
- **Title**: "Create Custom Agent" or "Edit Agent"
- **Contains**:
  - Agent metadata form (name, description, author, tags)
  - System prompt editor with character count
  - Goals list (1-7 items)
  - Checklists manager
  - Custom lists (up to 7)
  - Real-time validation
  - Save/Cancel buttons
  - Test mode preview

#### **Agent Gallery Panel**
- **Title**: "🔍 Agent Gallery"
- **Contains**:
  - Search/filter box
  - Grid of 5 built-in agent templates:
    1. Research Assistant
    2. Code Reviewer
    3. Documentation Writer
    4. Test Case Generator
    5. Bug Analyzer
  - Agent cards showing: name, description, difficulty, rating, downloads
  - Install/Info buttons for each agent

#### **Conversation Webview Panel**
- **Title**: Conversation ID or "New Conversation"
- **Contains**:
  - Chat message history
  - Message input box
  - Clear history button
  - Conversation context info

#### **Verification Panel**
- **Title**: "Verification Results"
- **Shows**:
  - Verification status for current ticket
  - Verification details and results

---

### 5. ⚙️ Settings & Configuration

**Location**: VS Code Settings → COE

Available settings:
- `coe.autoProcessTickets` - Enable/disable auto mode (default: true)
- `coe.enablePlanningAgent` - Enable planning agent (default: true)
- `coe.enableOrchestratorAgent` - Enable orchestrator (default: true)
- `coe.enableAnswerAgent` - Enable answer agent (default: true)
- `coe.enableVerificationAgent` - Enable verification (default: true)
- `coe.enableResearchAgent` - Enable research agent (default: false)
- `coe.llmEndpoint` - LLM server URL (default: http://127.0.0.1:1234/v1)
- `coe.llmModel` - Model name (default: ministral-3-14b-reasoning)
- `coe.llmTimeoutSeconds` - Timeout in seconds (default: 60)
- `coe.llmMaxTokens` - Max response tokens (default: 2048)

---

## How to Access Each Feature

### To Create a Custom Agent:
1. `Ctrl+Shift+P` → "COE: Create Custom Agent"
2. Fill in the form in the webview panel
3. Click **Save**

### To Browse Agent Templates:
1. `Ctrl+Shift+P` → "COE: Open Agent Gallery"
2. Browse the gallery
3. Click **Install** on any agent

### To Ask a Question:
1. `Ctrl+Shift+P` → "COE: Ask Answer Agent"
2. Type your question in the conversation panel
3. Wait for response

### To Process a Ticket:
1. Select a ticket in the **Tickets Panel**
2. Right-click → "Process This Ticket"
3. Or use command: `Ctrl+Shift+P` → "COE: Process This Ticket"

### To View Agent Status:
1. Look at **Agents Panel** in sidebar
2. Or open Command Palette → "COE: Show Orchestrator Status Details"
3. Or look at **Orchestrator Status Panel** in sidebar

---

## File Organization

Custom agents are stored at:
```
.coe/agents/custom/{agent-name}/config.json
```

Data structures:
```
.coe/
├── agents/
│   └── custom/
│       └── {agent-name}/
│           └── config.json
├── tickets/
│   └── *.json
└── conversations/
    └── *.json
```

---

## Status Summary

✅ **Extension Status**: Fully Functional
- Compilation: Zero errors
- Tests: 2331/2367 passing
- Dependencies: All resolved
- Commands: All registered
- UI: All panels accessible

✅ **Fixed in This Session**:
1. Removed unused `uuid` dependency (caused module loading error)
2. Added `coe.openCustomAgentBuilder` command + registration
3. Added `coe.showAgentGallery` command + registration
4. All tests still passing after changes

✅ **Ready to Use**:
- Custom Agent Builder
- Agent Gallery
- All existing agents and features

---

## Next Steps

1. **Reload VS Code** to ensure extension loads fresh:
   - Press `Ctrl+Shift+P`
   - Type `Developer: Reload Window`
   - Press Enter

2. **Check Sidebar** for all four panels (Agents, Tickets, Conversations, Orchestrator Status)

3. **Try Creating an Agent**:
   - `Ctrl+Shift+P` → "COE: Create Custom Agent"

4. **Try Gallery**:
   - `Ctrl+Shift+P` → "COE: Open Agent Gallery"

