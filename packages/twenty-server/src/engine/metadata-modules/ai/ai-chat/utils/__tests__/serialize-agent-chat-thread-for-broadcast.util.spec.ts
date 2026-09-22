import { AgentChatThreadEntity } from 'src/engine/metadata-modules/ai/ai-chat/entities/agent-chat-thread.entity';
import { serializeAgentChatThreadForBroadcast } from 'src/engine/metadata-modules/ai/ai-chat/utils/serialize-agent-chat-thread-for-broadcast.util';

describe('Thread broadcast permissions', () => {
  it.each([
    ['owner', true],
    ['viewer', false],
  ])(
    'preserves effective permissions for recipient %s',
    (_recipient, canUpdate) => {
      const thread = Object.assign(new AgentChatThreadEntity(), {
        id: 'thread',
        userWorkspaceId: 'owner',
        totalInputCredits: 0,
        totalOutputCredits: 0,
      });
      expect(
        serializeAgentChatThreadForBroadcast({
          thread,
          lastMessageAt: null,
          permissions: {
            canRead: true,
            canUpdate: Boolean(canUpdate),
            canDelete: false,
            canSoftDelete: false,
          },
        }),
      ).toMatchObject({
        id: 'thread',
        permissions: {
          canRead: true,
          canUpdate,
          canDelete: false,
          canSoftDelete: false,
        },
      });
    },
  );
});
