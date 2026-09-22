import { agentChatThreadPermissionsFamilySelector } from '@/ai/states/selectors/agentChatThreadPermissionsFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useLingui } from '@lingui/react/macro';
import { type ReactNode } from 'react';
import {
  IconArchive,
  IconArchiveOff,
  IconDotsVertical,
  IconPencil,
  IconTrash,
} from 'twenty-ui/icon';
import { LightIconButton } from 'twenty-ui/components';
import { MenuItem } from 'twenty-ui/primitives/navigation';

import { type AiChatThreadActionsSurface } from '@/ai/types/AiChatThreadActionsSurface';
import { useChatThreadArchiveActions } from '@/ai/hooks/useChatThreadArchiveActions';
import { aiChatThreadPendingDeleteFamilyState } from '@/ai/states/aiChatThreadPendingDeleteFamilyState';
import { getAiChatThreadDeleteModalId } from '@/ai/utils/getAiChatThreadDeleteModalId';
import { getAiChatThreadItemMenuDropdownId } from '@/ai/utils/getAiChatThreadItemMenuDropdownId';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useSetAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useSetAtomFamilyState';

type AiChatThreadItemMenuProps = {
  threadId: string;
  threadTitle: string;
  isArchived: boolean;
  surface: AiChatThreadActionsSurface;
  onRenameRequested: () => void;
  clickableComponent?: ReactNode;
};

export const AiChatThreadItemMenu = ({
  threadId,
  threadTitle,
  isArchived,
  surface,
  onRenameRequested,
  clickableComponent,
}: AiChatThreadItemMenuProps) => {
  const { t } = useLingui();
  const dropdownId = getAiChatThreadItemMenuDropdownId(threadId, surface);
  const { closeDropdown } = useCloseDropdown();
  const { openDialog } = useDialog();
  const { archiveChatThread, unarchiveChatThread } =
    useChatThreadArchiveActions();
  const setAiChatThreadPendingDelete = useSetAtomFamilyState(
    aiChatThreadPendingDeleteFamilyState,
    surface,
  );

  const permissions = useAtomFamilySelectorValue(
    agentChatThreadPermissionsFamilySelector,
    threadId,
  );

  const handleRename = (event: React.MouseEvent) => {
    event.stopPropagation();
    closeDropdown(dropdownId);
    onRenameRequested();
  };

  const handleArchive = async (event: React.MouseEvent) => {
    event.stopPropagation();
    closeDropdown(dropdownId);
    if (isArchived) {
      await unarchiveChatThread(threadId);
    } else {
      await archiveChatThread(threadId);
    }
  };

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    closeDropdown(dropdownId);
    setAiChatThreadPendingDelete({ threadId, threadTitle });
    openDialog(getAiChatThreadDeleteModalId(surface));
  };

  if (
    !permissions ||
    (!permissions.canUpdate &&
      !permissions.canDelete &&
      !permissions.canSoftDelete)
  ) {
    return null;
  }

  return (
    <Dropdown
      dropdownId={dropdownId}
      dropdownPlacement="bottom-end"
      clickableComponent={
        clickableComponent ?? (
          <LightIconButton aria-label={t`Chat actions`} emphasis="subtle">
            <IconDotsVertical />
          </LightIconButton>
        )
      }
      dropdownComponents={
        <DropdownContent>
          <DropdownMenuItemsContainer>
            {permissions.canUpdate && (
              <MenuItem
                text={t`Rename`}
                LeftIcon={IconPencil}
                onClick={handleRename}
              />
            )}
            {permissions.canSoftDelete && (
              <MenuItem
                text={isArchived ? t`Unarchive` : t`Archive`}
                LeftIcon={isArchived ? IconArchiveOff : IconArchive}
                onClick={handleArchive}
              />
            )}
            {permissions.canDelete && (
              <MenuItem
                accent="danger"
                text={t`Delete`}
                LeftIcon={IconTrash}
                onClick={handleDelete}
              />
            )}
          </DropdownMenuItemsContainer>
        </DropdownContent>
      }
    />
  );
};
