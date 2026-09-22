import { type RecordShareService } from 'src/engine/core-modules/record-share/services/record-share.service';
import { type BillingSubscriptionService } from 'src/engine/core-modules/billing/services/billing-subscription.service';
import { EnableCommonRecordSharingCommand } from 'src/database/commands/upgrade-version-command/2-42/2-42-workspace-command-1790069860694-enable-common-record-sharing.command';
import { type AgentHistoryStorageService } from 'src/engine/metadata-modules/ai/ai-history/services/agent-history-storage.service';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { randomUUID } from 'node:crypto';
import { parse } from 'graphql';
import {
  FeatureFlagKey,
  RecordShareAccessLevel,
  RecordSharePrincipalType,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { updateFeatureFlag } from 'test/integration/metadata/suites/utils/update-feature-flag.util';
import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';
import { type AgentChatService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat.service';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type RecordSharePrincipalInput } from 'src/engine/core-modules/record-share/dtos/record-sharing.dto';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

// Avoid loading the migration runner's ESM file dependencies inside Jest. The
// command below receives the real migration service from the running test app.
jest.mock(
  'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service',
  () => ({ WorkspaceMigrationValidateBuildAndRunService: class {} }),
);

const READ_THREAD = parse(`query ReadSharedThread($id: UUID!) {
  chatThread(id: $id) { id title permissions { canRead canUpdate canDelete canSoftDelete } }
}`);
const SET_SHARE =
  parse(`mutation SetThreadShare($target: RecordSharingTargetInput!, $principal: RecordSharePrincipalInput!, $enabled: Boolean!) {
  setRecordShare(target: $target, principal: $principal, enabled: $enabled) { isEnabled }
}`);

describe('Conversation sharing through the authenticated API', () => {
  it.each(['member', 'role', 'everyone'])(
    'grants read-only %s access and denies it immediately after revocation',
    async (audience) => {
      const workspaceId = SEED_APPLE_WORKSPACE_ID;
      const cache = getAppProviderByClassName<WorkspaceCacheService>(
        'WorkspaceCacheService',
      );
      const { featureFlagsMap, userWorkspaceRoleMap, flatObjectMetadataMaps } =
        await cache.getOrRecompute(workspaceId, [
          'featureFlagsMap',
          'userWorkspaceRoleMap',
          'flatObjectMetadataMaps',
        ]);
      const previousEnabled =
        featureFlagsMap[FeatureFlagKey.IS_RECORD_SHARING_ENABLED] === true;
      const roleId = userWorkspaceRoleMap[USER_WORKSPACE_DATA_SEED_IDS.JONY];
      if (!isDefined(roleId)) {
        throw new Error('Seeded recipient role is missing');
      }
      const principal: RecordSharePrincipalInput =
        audience === 'member'
          ? { workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY }
          : audience === 'role'
            ? { roleId }
            : { everyone: true };
      const chatService =
        getAppProviderByClassName<AgentChatService>('AgentChatService');
      const threadId = randomUUID();
      const target = {
        objectMetadataId:
          flatObjectMetadataMaps.byUniversalIdentifier[
            STANDARD_OBJECTS.agentChatThread.universalIdentifier
          ]!.id,
        recordId: threadId,
      };
      const owner = {
        workspaceId,
        userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JANE,
      };
      await chatService.createThread({
        ...owner,
        id: threadId,
        title: 'Private sharing regression',
      });
      const read = () =>
        makeMetadataAPIRequest(
          { query: READ_THREAD, variables: { id: threadId } },
          APPLE_JONY_MEMBER_ACCESS_TOKEN,
        );
      const changeShare = (enabled: boolean) =>
        makeMetadataAPIRequest({
          query: SET_SHARE,
          variables: { target, principal, enabled },
        });
      try {
        await updateFeatureFlag({
          featureFlag: FeatureFlagKey.IS_RECORD_SHARING_ENABLED,
          value: true,
          expectToFail: false,
        });
        expect((await read()).body.errors[0].extensions.code).toBe('NOT_FOUND');
        expect((await changeShare(true)).body.errors).toBeUndefined();
        const readable = await read();
        expect(readable.body.errors).toBeUndefined();
        expect(readable.body.data.chatThread).toMatchObject({
          id: threadId,
          permissions: {
            canRead: true,
            canUpdate: false,
            canDelete: false,
            canSoftDelete: false,
          },
        });
        const audienceDetails = await makeMetadataAPIRequest(
          {
            query:
              parse(`query SharingDetails($target: RecordSharingTargetInput!) {
            recordSharing(target: $target) { permissions { canRead canUpdate canDelete canSoftDelete } shares { principalId } roles { id } }
          }`),
            variables: { target },
          },
          APPLE_JONY_MEMBER_ACCESS_TOKEN,
        );
        expect(audienceDetails.body.data.recordSharing).toEqual({
          permissions: {
            canRead: true,
            canUpdate: false,
            canDelete: false,
            canSoftDelete: false,
          },
          shares: [],
          roles: [],
        });
        const rename = await makeMetadataAPIRequest(
          {
            query: parse(
              `mutation RenameSharedThread($id: UUID!) { renameChatThread(id: $id, title: "Unauthorized rename") { id } }`,
            ),
            variables: { id: threadId },
          },
          APPLE_JONY_MEMBER_ACCESS_TOKEN,
        );
        expect(rename.body.errors[0].extensions.code).toBe('NOT_FOUND');
        const grantAsViewer = await makeMetadataAPIRequest(
          {
            query: SET_SHARE,
            variables: { target, principal: { everyone: true }, enabled: true },
          },
          APPLE_JONY_MEMBER_ACCESS_TOKEN,
        );
        expect(grantAsViewer.body.errors[0].extensions.code).toBe('NOT_FOUND');
        const anonymous = await makeMetadataAPIRequest(
          { query: READ_THREAD, variables: { id: threadId } },
          null,
        );
        expect(anonymous.body.errors).toBeDefined();
        expect((await changeShare(false)).body.errors).toBeUndefined();
        expect((await read()).body.errors[0].extensions.code).toBe('NOT_FOUND');
      } finally {
        await chatService.hardDeleteThread({ ...owner, threadId });
        await updateFeatureFlag({
          featureFlag: FeatureFlagKey.IS_RECORD_SHARING_ENABLED,
          value: previousEnabled,
          expectToFail: false,
        });
      }
    },
  );
  it('retains ownership through upgrade rollback and retry, including flag-off and archived history', async () => {
    const cache = getAppProviderByClassName<WorkspaceCacheService>(
      'WorkspaceCacheService',
    );
    const chatService =
      getAppProviderByClassName<AgentChatService>('AgentChatService');
    const command = new EnableCommonRecordSharingCommand(
      {} as never,
      cache,
      getAppProviderByClassName<AgentHistoryStorageService>(
        'AgentHistoryStorageService',
      ),
      getAppProviderByClassName<WorkspaceMigrationValidateBuildAndRunService>(
        'WorkspaceMigrationValidateBuildAndRunService',
      ),
      getAppProviderByClassName<BillingSubscriptionService>(
        'BillingSubscriptionService',
      ),
    );
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const owner = {
      workspaceId,
      userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JANE,
      threadId: randomUUID(),
    };
    const options = { workspaceId, options: { dryRun: false } } as never;
    const originalFlag =
      (await cache.getOrRecompute(workspaceId, ['featureFlagsMap']))
        .featureFlagsMap[FeatureFlagKey.IS_RECORD_SHARING_ENABLED] === true;
    await chatService.createThread({
      ...owner,
      id: owner.threadId,
      title: 'Upgrade ownership test',
    });
    try {
      await command.down(options);
      expect(
        (
          await makeMetadataAPIRequest({
            query: READ_THREAD,
            variables: { id: owner.threadId },
          })
        ).body.errors,
      ).toBeUndefined();
      await command.up(options);
      await command.up(options);
      await updateFeatureFlag({
        featureFlag: FeatureFlagKey.IS_RECORD_SHARING_ENABLED,
        value: false,
        expectToFail: false,
      });
      const readable = await makeMetadataAPIRequest({
        query: READ_THREAD,
        variables: { id: owner.threadId },
      });
      expect(readable.body.errors).toBeUndefined();
      expect(readable.body.data.chatThread.permissions).toEqual({
        canRead: true,
        canUpdate: true,
        canDelete: true,
        canSoftDelete: true,
      });
      await chatService.archiveThread(owner);
      expect(
        (await chatService.getThreadsForUser(owner)).some(
          ({ id }) => id === owner.threadId,
        ),
      ).toBe(true);
      await chatService.unarchiveThread(owner);
      expect(
        (
          await makeMetadataAPIRequest({
            query: READ_THREAD,
            variables: { id: owner.threadId },
          })
        ).body.errors,
      ).toBeUndefined();
    } finally {
      await command.up(options);
      await chatService.hardDeleteThread(owner);
      await updateFeatureFlag({
        featureFlag: FeatureFlagKey.IS_RECORD_SHARING_ENABLED,
        value: originalFlag,
        expectToFail: false,
      });
    }
  });
  it('lets non-owner writers rename through ordinary permissions and denies them after revocation', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const chat =
      getAppProviderByClassName<AgentChatService>('AgentChatService');
    const shareService =
      getAppProviderByClassName<RecordShareService>('RecordShareService');
    const cache = getAppProviderByClassName<WorkspaceCacheService>(
      'WorkspaceCacheService',
    );
    const { flatObjectMetadataMaps } = await cache.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    const owner = {
      workspaceId,
      userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JANE,
      threadId: randomUUID(),
    };
    const writer = {
      ...owner,
      userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JONY,
    };
    await chat.createThread({
      ...owner,
      id: owner.threadId,
      title: 'Original',
    });
    const share = {
      objectMetadataId:
        flatObjectMetadataMaps.byUniversalIdentifier[
          STANDARD_OBJECTS.agentChatThread.universalIdentifier
        ]!.id,
      recordId: owner.threadId,
      sourceId: owner.threadId,
      principalId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
      principalType: RecordSharePrincipalType.WORKSPACE_MEMBER,
      accessLevel: RecordShareAccessLevel.READ_WRITE,
    };
    try {
      await shareService.setManualShare({ workspaceId, share, enabled: true });
      expect(
        await chat.updateThreadTitle({
          ...writer,
          title: 'Collaborative rename',
        }),
      ).toMatchObject({
        title: 'Collaborative rename',
        userWorkspaceId: owner.userWorkspaceId,
      });
      await expect(
        chat.assertThreadExecutionAllowed(writer),
      ).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
      await shareService.setManualShare({ workspaceId, share, enabled: false });
      await expect(
        chat.updateThreadTitle({ ...writer, title: 'Revoked rename' }),
      ).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
      expect(await chat.getThreadById(owner)).toMatchObject({
        title: 'Collaborative rename',
      });
    } finally {
      await chat.hardDeleteThread(owner);
    }
  });

  it('rolls back creation when grant initialization fails', async () => {
    const chat =
      getAppProviderByClassName<AgentChatService>('AgentChatService');
    const shareService =
      getAppProviderByClassName<RecordShareService>('RecordShareService');
    const owner = {
      workspaceId: SEED_APPLE_WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JANE,
      threadId: randomUUID(),
    };
    const cleanup = jest
      .spyOn(shareService, 'deleteByRecordIdsInTransaction')
      .mockRejectedValueOnce(new Error('Grant storage unavailable'));
    try {
      await expect(
        chat.createThread({ ...owner, id: owner.threadId }),
      ).rejects.toThrow('Grant storage unavailable');
    } finally {
      cleanup.mockRestore();
    }
    await expect(chat.getThreadById(owner)).rejects.toMatchObject({
      code: 'THREAD_NOT_FOUND',
    });
  });
});
