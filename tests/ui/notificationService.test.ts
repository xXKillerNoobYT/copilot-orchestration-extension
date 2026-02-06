/**
 * Tests for NotificationService (Stage 6)
 */

import {
    NotificationService,
    initializeNotificationService,
    getNotificationService,
    resetNotificationServiceForTests,
    NotifiableTicket,
    NotificationConfig
} from '../../src/ui/notificationService';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        }))
    },
    commands: {
        executeCommand: jest.fn()
    }
}));

const mockShowMessage = vscode.window.showInformationMessage as jest.Mock;
const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

describe('NotificationService', () => {
    let service: NotificationService;

    const createTicket = (overrides: Partial<NotifiableTicket> = {}): NotifiableTicket => ({
        id: `ticket-${Math.random().toString(36).substr(2, 9)}`,
        title: 'Test Ticket',
        priority: 1,
        status: 'pending',
        createdAt: new Date(),
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        resetNotificationServiceForTests();
        service = new NotificationService();
    });

    afterEach(() => {
        service.dispose();
        jest.useRealTimers();
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            expect(service).toBeDefined();
            expect(service.isEnabled()).toBe(true);
        });

        it('should create instance with custom config', () => {
            const customService = new NotificationService({
                minPriority: 0,
                enabled: false
            });
            expect(customService.isEnabled()).toBe(false);
            customService.dispose();
        });
    });

    describe('Test 2: notifyTicket', () => {
        it('should queue P1 ticket for notification', () => {
            const ticket = createTicket({ priority: 1 });
            const result = service.notifyTicket(ticket);
            expect(result).toBe(true);
        });

        it('should queue P0 ticket for notification', () => {
            const ticket = createTicket({ priority: 0 });
            const result = service.notifyTicket(ticket);
            expect(result).toBe(true);
        });

        it('should not notify P2 tickets by default', () => {
            const ticket = createTicket({ priority: 2 });
            const result = service.notifyTicket(ticket);
            expect(result).toBe(false);
        });

        it('should not notify P3 tickets by default', () => {
            const ticket = createTicket({ priority: 3 });
            const result = service.notifyTicket(ticket);
            expect(result).toBe(false);
        });

        it('should not notify when disabled', () => {
            service.setEnabled(false);
            const ticket = createTicket({ priority: 1 });
            const result = service.notifyTicket(ticket);
            expect(result).toBe(false);
        });

        it('should not re-notify same ticket', () => {
            const ticket = createTicket({ priority: 1 });
            service.notifyTicket(ticket);
            const result = service.notifyTicket(ticket);
            expect(result).toBe(false);
        });
    });

    describe('Test 3: single notification', () => {
        it('should show notification after delay', async () => {
            mockShowMessage.mockResolvedValue('Dismiss');
            
            const ticket = createTicket({ priority: 1, title: 'Important Issue' });
            service.notifyTicket(ticket);

            // Fast-forward past delay
            jest.advanceTimersByTime(600);
            await Promise.resolve(); // Let promises resolve

            expect(mockShowMessage).toHaveBeenCalledWith(
                expect.stringContaining('Important Issue'),
                expect.any(Object),
                'Open',
                'Snooze',
                'Dismiss'
            );
        });

        it('should include priority label in notification', async () => {
            mockShowMessage.mockResolvedValue('Dismiss');
            
            const ticket = createTicket({ priority: 0, title: 'Critical Bug' });
            service.notifyTicket(ticket);
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();

            expect(mockShowMessage).toHaveBeenCalledWith(
                expect.stringContaining('Critical'),
                expect.any(Object),
                expect.any(String),
                expect.any(String),
                expect.any(String)
            );
        });
    });

    describe('Test 4: batch notifications', () => {
        it('should batch multiple tickets', async () => {
            mockShowMessage.mockResolvedValue('View All');
            
            service.notifyTicket(createTicket({ priority: 1 }));
            service.notifyTicket(createTicket({ priority: 1 }));
            service.notifyTicket(createTicket({ priority: 0 }));
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();

            expect(mockShowMessage).toHaveBeenCalledWith(
                expect.stringContaining('3 high-priority tickets'),
                expect.any(Object),
                'View All',
                'Dismiss'
            );
        });

        it('should show Critical count in batch', async () => {
            mockShowMessage.mockResolvedValue('Dismiss');
            
            service.notifyTicket(createTicket({ priority: 0 }));
            service.notifyTicket(createTicket({ priority: 0 }));
            service.notifyTicket(createTicket({ priority: 1 }));
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();

            expect(mockShowMessage).toHaveBeenCalledWith(
                expect.stringContaining('2 Critical'),
                expect.any(Object),
                expect.any(String),
                expect.any(String)
            );
        });

        it('should show immediately when batch is full', async () => {
            mockShowMessage.mockResolvedValue('Dismiss');
            
            // Add 5 tickets (default max batch size)
            for (let i = 0; i < 5; i++) {
                service.notifyTicket(createTicket({ priority: 1 }));
            }
            
            // Should show without waiting for timer
            await Promise.resolve();
            
            expect(mockShowMessage).toHaveBeenCalled();
        });
    });

    describe('Test 5: notification actions', () => {
        it('should open ticket on Open action', async () => {
            mockShowMessage.mockResolvedValue('Open');
            
            const ticket = createTicket({ priority: 1 });
            service.notifyTicket(ticket);
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();
            await Promise.resolve(); // Extra tick for action handling

            expect(mockExecuteCommand).toHaveBeenCalledWith('coe.openTicket', ticket.id);
        });

        it('should focus tickets view on View All action', async () => {
            mockShowMessage.mockResolvedValue('View All');
            
            service.notifyTicket(createTicket({ priority: 1 }));
            service.notifyTicket(createTicket({ priority: 1 }));
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();
            await Promise.resolve();

            expect(mockExecuteCommand).toHaveBeenCalledWith('coe-tickets.focus');
        });
    });

    describe('Test 6: snooze', () => {
        it('should not notify snoozed tickets', () => {
            const ticket = createTicket({ priority: 1 });
            service.snoozeTicket(ticket.id, 5000);
            
            const result = service.notifyTicket(ticket);
            expect(result).toBe(false);
        });

        it('should allow notification after snooze expires', () => {
            const ticket = createTicket({ priority: 1 });
            service.snoozeTicket(ticket.id, 1000);
            
            // Still snoozed
            expect(service.notifyTicket(ticket)).toBe(false);
            
            // After snooze expires
            jest.advanceTimersByTime(1100);
            expect(service.notifyTicket(ticket)).toBe(true);
        });
    });

    describe('Test 7: configuration', () => {
        it('should update minPriority', () => {
            service.updateConfig({ minPriority: 2 });
            
            const p2Ticket = createTicket({ priority: 2 });
            expect(service.notifyTicket(p2Ticket)).toBe(true);
        });

        it('should enable/disable notifications', () => {
            service.setEnabled(false);
            expect(service.isEnabled()).toBe(false);
            
            service.setEnabled(true);
            expect(service.isEnabled()).toBe(true);
        });
    });

    describe('Test 8: events', () => {
        it('should emit notification-shown event', async () => {
            mockShowMessage.mockResolvedValue('Dismiss');
            const handler = jest.fn();
            service.on('notification-shown', handler);
            
            service.notifyTicket(createTicket({ priority: 1 }));
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();
            await Promise.resolve();

            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                ticket: expect.any(Object),
                action: expect.any(String)
            }));
        });

        it('should emit batch-shown event', async () => {
            mockShowMessage.mockResolvedValue('Dismiss');
            const handler = jest.fn();
            service.on('batch-shown', handler);
            
            service.notifyTicket(createTicket({ priority: 1 }));
            service.notifyTicket(createTicket({ priority: 1 }));
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();
            await Promise.resolve();

            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                tickets: expect.any(Array),
                action: expect.any(String)
            }));
        });

        it('should emit notification-action event', async () => {
            mockShowMessage.mockResolvedValue('Dismiss');
            const handler = jest.fn();
            service.on('notification-action', handler);
            
            service.notifyTicket(createTicket({ priority: 1 }));
            
            jest.advanceTimersByTime(600);
            await Promise.resolve();
            await Promise.resolve();

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('Test 9: reset', () => {
        it('should clear all state', () => {
            service.notifyTicket(createTicket({ priority: 1 }));
            service.snoozeTicket('test-id', 5000);
            
            service.reset();
            
            // Should be able to notify same ticket again
            const ticket = createTicket({ id: 'test-id', priority: 1 });
            expect(service.notifyTicket(ticket)).toBe(true);
        });
    });

    describe('Test 10: singleton pattern', () => {
        beforeEach(() => {
            resetNotificationServiceForTests();
        });

        it('should initialize singleton', () => {
            const instance = initializeNotificationService();
            expect(instance).toBeDefined();
        });

        it('should throw if initialized twice', () => {
            initializeNotificationService();
            expect(() => initializeNotificationService()).toThrow();
        });

        it('should get instance after initialization', () => {
            initializeNotificationService();
            const instance = getNotificationService();
            expect(instance).toBeDefined();
        });

        it('should throw if getInstance before init', () => {
            expect(() => getNotificationService()).toThrow();
        });
    });
});
