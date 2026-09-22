import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { MetadataReadability, MetadataWritability } from 'twenty-shared/types';

import { EnableCommonRecordSharingCommand } from 'src/database/commands/upgrade-version-command/2-42/2-42-workspace-command-1790076972624-enable-common-record-sharing.command';
import { backfillChatThreadOwnerGrants } from 'src/engine/metadata-modules/ai/ai-chat/utils/backfill-chat-thread-owner-grants.util';

jest.mock(
  'src/engine/metadata-modules/ai/ai-chat/utils/backfill-chat-thread-owner-grants.util',
);

const args = {
  workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea419',
  options: { dryRun: false },
} as never;
const buildCommand = () => {
  const maps = {
    featureFlagsMap: {},
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        [STANDARD_OBJECTS.agentChatThread.universalIdentifier]: {
          id: 'thread',
        },
      },
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: {
        [STANDARD_OBJECTS.agentChatThread.fields.title.universalIdentifier]: {
          id: 'title',
        },
      },
    },
  };
  const context = {
    manager: { query: jest.fn().mockResolvedValue([]) },
    storage: 'workspace',
    table: () => 'workspace.thread',
  };
  const storage = {
    run: jest
      .fn()
      .mockImplementation(async (_workspaceId, work) => work(context)),
  };
  const migrations = {
    validateBuildAndRunLegacyWorkspaceMigration: jest
      .fn()
      .mockResolvedValue({ status: 'success' }),
  };
  const command = new EnableCommonRecordSharingCommand(
    {} as never,
    {
      getOrRecompute: jest.fn().mockResolvedValue(maps),
      invalidateAndRecompute: jest.fn(),
    } as never,
    storage as never,
    migrations as never,
    {} as never,
  );
  return { command, storage, migrations, context, maps };
};

describe('Common sharing upgrade', () => {
  beforeEach(() => jest.resetAllMocks());

  it.each([
    {
      hasSchema: false,
      storage: 'core',
      migration: undefined,
      history: [],
      skips: true,
    },
    {
      hasSchema: true,
      storage: 'core',
      migration: undefined,
      history: [],
      skips: false,
    },
    {
      hasSchema: false,
      storage: 'workspace',
      migration: undefined,
      history: [],
      skips: false,
    },
    {
      hasSchema: false,
      storage: 'core',
      migration: {},
      history: [],
      skips: false,
    },
    {
      hasSchema: false,
      storage: 'core',
      migration: undefined,
      history: [{ exists: 1 }],
      skips: false,
    },
  ])(
    'only skips absent metadata for an empty, unprovisioned workspace: %j',
    async (scenario) => {
      const { command, maps, migrations, storage } = buildCommand();
      Object.assign(maps.flatObjectMetadataMaps, { byUniversalIdentifier: {} });
      const runner = {
        connect: jest.fn(),
        release: jest.fn(),
        hasSchema: jest.fn().mockResolvedValue(scenario.hasSchema),
        query: jest.fn().mockResolvedValue(scenario.history),
      };
      Object.assign(storage, {
        readState: jest.fn().mockResolvedValue({
          storage: scenario.storage,
          migration: scenario.migration,
        }),
      });
      const result = command.up({
        workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea419',
        options: { dryRun: false },
        dataSource: { createQueryRunner: () => runner },
      } as never);
      if (scenario.skips) {
        await expect(result).resolves.toBeUndefined();
      } else {
        await expect(result).rejects.toThrow(
          'Conversation metadata must be provisioned',
        );
      }
      expect(runner.release).toHaveBeenCalledTimes(1);
      expect(
        migrations.validateBuildAndRunLegacyWorkspaceMigration,
      ).not.toHaveBeenCalled();
    },
  );

  it('backfills owner access before enabling private record permissions', async () => {
    const { command, migrations } = buildCommand();
    migrations.validateBuildAndRunLegacyWorkspaceMigration.mockImplementation(
      async (migration) => {
        expect(backfillChatThreadOwnerGrants).toHaveBeenCalledTimes(1);
        expect(
          migration.allFlatEntityOperationByMetadataName.objectMetadata
            .flatEntityToUpdate,
        ).toEqual([
          {
            id: 'thread',
            readability: MetadataReadability.PRIVATE,
            writability: MetadataWritability.OPEN,
          },
        ]);
        expect(
          migration.allFlatEntityOperationByMetadataName.fieldMetadata
            .flatEntityToUpdate,
        ).toEqual([{ id: 'title', writability: MetadataWritability.OPEN }]);
        return { status: 'success' };
      },
    );
    await command.up(args);
  });

  it('does not change metadata when ownership backfill fails', async () => {
    const { command, migrations } = buildCommand();
    jest
      .mocked(backfillChatThreadOwnerGrants)
      .mockRejectedValue(new Error('Storage unavailable'));
    await expect(command.up(args)).rejects.toThrow('Storage unavailable');
    expect(
      migrations.validateBuildAndRunLegacyWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('requires history to have moved to workspace storage first', async () => {
    const { command, context, migrations } = buildCommand();
    context.storage = 'core';
    await expect(command.up(args)).rejects.toThrow(
      'Migrate agent history to workspace storage',
    );
    expect(backfillChatThreadOwnerGrants).not.toHaveBeenCalled();
    expect(
      migrations.validateBuildAndRunLegacyWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('reports a metadata migration failure instead of advancing the upgrade cursor', async () => {
    const { command, migrations } = buildCommand();
    migrations.validateBuildAndRunLegacyWorkspaceMigration.mockResolvedValue({
      status: 'fail',
    });
    await expect(command.up(args)).rejects.toThrow(
      'Could not migrate conversation permissions',
    );
  });

  it('supports dry runs without changing grants or metadata', async () => {
    const { command, storage, migrations } = buildCommand();
    await command.up({
      workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea419',
      options: { dryRun: true },
    } as never);
    expect(storage.run).not.toHaveBeenCalled();
    expect(
      migrations.validateBuildAndRunLegacyWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('restores SYSTEM protection on rollback without deleting ownership grants', async () => {
    const { command, storage, migrations } = buildCommand();
    await command.down(args);
    expect(storage.run).not.toHaveBeenCalled();
    expect(
      migrations.validateBuildAndRunLegacyWorkspaceMigration,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        allFlatEntityOperationByMetadataName: expect.objectContaining({
          objectMetadata: expect.objectContaining({
            flatEntityToUpdate: [
              {
                id: 'thread',
                readability: MetadataReadability.SYSTEM,
                writability: MetadataWritability.SYSTEM,
              },
            ],
          }),
        }),
      }),
    );
  });
});
