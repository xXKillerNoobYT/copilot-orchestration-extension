# Manual Test: Sidebar Auto-Refresh

## Purpose
Verify that the Tickets sidebar tab auto-refreshes when tickets are created or updated.

## Setup
1. Press F5 to start debugging the extension
2. Click the "COE" icon in Activity Bar (left sidebar)
3. Click the "Tickets" tab

## Test 1: Verify Initial State
**Expected**: Should see "No open tickets" (or existing open tickets if any)

## Test 2: Create Ticket and Verify Auto-Refresh
Add this temporary code to `src/extension.ts` after provider registration:

```typescript
// TEMP TEST CODE - Remove after verification
setTimeout(async () => {
    logInfo('=== TEST: Creating ticket ===');
    await createTicket({ 
        title: 'Test Auto-Refresh', 
        status: 'open',
        description: 'Testing sidebar auto-refresh' 
    });
    logInfo('=== TEST: Ticket created, sidebar should refresh automatically ===');
}, 5000); // Wait 5 seconds after extension activates
```

**Expected Logs** (check Output > COE):
1. `[INFO] Created ticket: TICKET-xxx`
2. `[INFO] Emitting change event to refresh sidebar`
3. `[INFO] Ticket change event received, refreshing tree view`

**Expected UI**: 
- After 5 seconds, "Test Auto-Refresh" ticket appears in Tickets tab
- No manual refresh needed (no F5)

## Test 3: Update Ticket and Verify Auto-Refresh
Add this code (after the create test):

```typescript
// TEMP TEST CODE - Update test
setTimeout(async () => {
    logInfo('=== TEST: Updating ticket ===');
    const tickets = await listTickets();
    if (tickets.length > 0) {
        await updateTicket(tickets[0].id, { status: 'in-progress' });
        logInfo('=== TEST: Ticket updated, sidebar should refresh ===');
    }
}, 10000); // Wait 10 seconds (5 seconds after create)
```

**Expected Logs**:
1. `[INFO] Updated ticket: TICKET-xxx`
2. `[INFO] Emitting change event to refresh sidebar`
3. `[INFO] Ticket change event received, refreshing tree view`

**Expected UI**:
- Ticket status changes from "open" to "in-progress"
- Icon changes to spinning sync icon
- No manual refresh needed

## Test 4: Complete Ticket (Filter Test)
Add this code:

```typescript
// TEMP TEST CODE - Filter test (done tickets hidden)
setTimeout(async () => {
    logInfo('=== TEST: Marking ticket as done ===');
    const tickets = await listTickets();
    if (tickets.length > 0) {
        await updateTicket(tickets[0].id, { status: 'done' });
        logInfo('=== TEST: Done ticket should disappear from sidebar ===');
    }
}, 15000); // Wait 15 seconds
```

**Expected UI**:
- Ticket disappears from Tickets tab (filtered out)
- Shows "No open tickets" if this was the only ticket

## Troubleshooting
If auto-refresh doesn't work:
1. Check Output > COE for all three log messages
2. If only first log shown: EventEmitter not emitting (check ticketDb.ts emit calls)
3. If only first two logs: Subscription not working (check TicketsTreeProvider constructor)
4. If all logs present but no UI update: Check VS Code TreeView registration

## Cleanup
Remove all temporary test code from `extension.ts` after verification.
