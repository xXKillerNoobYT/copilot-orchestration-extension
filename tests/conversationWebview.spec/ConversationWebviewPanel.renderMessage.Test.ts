// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview.ts';

/** @aiContributed-2026-02-04 */
describe('ConversationWebviewPanel', () => {
    /** @aiContributed-2026-02-04 */
    describe('renderMessage', () => {
        let instance: ConversationWebviewPanel;

        beforeEach(() => {
            instance = new ConversationWebviewPanel(
                {} as Record<string, unknown>, 
                'testChatId', 
                {} as Record<string, unknown>, 
                []
            );
        });

        /** @aiContributed-2026-02-04 */
        it('should render a message with escaped HTML content for user role', () => {
            const message = { role: 'user', content: '<script>alert("XSS")</script>' };
            const result = instance.renderMessage(message as { role: string; content: string });
            expect(result).toContain('<div class="message user">');
            expect(result).toContain('<div class="message-bubble">&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;</div>');
        });

        /** @aiContributed-2026-02-04 */
        it('should render a message with escaped HTML content for assistant role', () => {
            const message = { role: 'assistant', content: '<b>Bold</b>' };
            const result = instance.renderMessage(message as { role: string; content: string });
            expect(result).toContain('<div class="message assistant">');
            expect(result).toContain('<div class="message-bubble">&lt;b&gt;Bold&lt;/b&gt;</div>');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle empty content gracefully', () => {
            const message = { role: 'user', content: '' };
            const result = instance.renderMessage(message as { role: string; content: string });
            expect(result).toContain('<div class="message user">');
            expect(result).toContain('<div class="message-bubble"></div>');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle null content gracefully', () => {
            const message = { role: 'assistant', content: null };
            const result = instance.renderMessage(message as { role: string; content: string | null });
            expect(result).toContain('<div class="message assistant">');
            expect(result).toContain('<div class="message-bubble"></div>');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle undefined content gracefully', () => {
            const message = { role: 'user', content: undefined };
            const result = instance.renderMessage(message as { role: string; content: string | undefined });
            expect(result).toContain('<div class="message user">');
            expect(result).toContain('<div class="message-bubble"></div>');
        });

        /** @aiContributed-2026-02-04 */
        it('should escape special characters in content', () => {
            const message = { role: 'assistant', content: '&<>"\'`' };
            const result = instance.renderMessage(message as { role: string; content: string });
            expect(result).toContain('<div class="message assistant">');
            expect(result).toContain('<div class="message-bubble">&amp;&lt;&gt;&quot;&#39;</div>');
        });
    });
});