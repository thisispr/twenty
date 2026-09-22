import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import {
  RecordSharePrincipalType,
  RecordShareRowCause,
  RecordShareAccessLevel,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { LightIconButton } from 'twenty-ui/components';
import {
  IconCheck,
  IconLink,
  IconLock,
  IconUsers,
  IconX,
} from 'twenty-ui/icon';
import { MenuItem } from 'twenty-ui/primitives/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { RecordSharingAction } from '@/object-record/record-sharing/components/RecordSharingAction';
import { type useRecordSharing } from '@/object-record/record-sharing/hooks/useRecordSharing';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuHeader } from '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  padding: ${themeCssVariables.spacing[2]};
`;

type RecordSharingDropdownContentProps = {
  title: string;
  description: string;
  recordUrl: string;
  sharingState: ReturnType<typeof useRecordSharing>;
};

export const RecordSharingDropdownContent = ({
  title,
  description,
  recordUrl,
  sharingState,
}: RecordSharingDropdownContentProps) => {
  const { t } = useLingui();
  const { sharing, loading, error, saving, setShare, refetch } = sharingState;
  const currentWorkspaceMembers = useAtomStateValue(
    currentWorkspaceMembersState,
  );
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { copyToClipboard } = useCopyToClipboard();
  const [search, setSearch] = useState('');
  const matchesSearch = (text: string) =>
    text.toLowerCase().includes(search.trim().toLowerCase());
  const shares = sharing?.shares ?? [];
  const isSharedWithEveryone = shares.some(
    (share) => share.principalType === RecordSharePrincipalType.EVERYONE,
  );
  const canAdd =
    sharing?.permissions.canUpdate === true && sharing.isEnabled && !saving;
  const availableMembers = currentWorkspaceMembers.filter(
    (member) =>
      !shares.some((share) => share.principalId === member.id) &&
      matchesSearch(
        `${member.name.firstName} ${member.name.lastName} ${member.userEmail}`,
      ),
  );
  const availableRoles = (sharing?.roles ?? []).filter(
    (role) =>
      !shares.some((share) => share.principalId === role.id) &&
      matchesSearch(role.label),
  );

  return (
    <DropdownContent widthInPixels={GenericDropdownContentWidth.ExtraLarge}>
      <DropdownMenuHeader>{title}</DropdownMenuHeader>
      {loading ? (
        <StyledDescription>{t`Loading…`}</StyledDescription>
      ) : error ? (
        <>
          <StyledDescription role="alert">{t`Sharing settings could not be loaded.`}</StyledDescription>
          <RecordSharingAction
            text={t`Try again`}
            onClick={() => {
              void refetch().catch(() => {});
            }}
          />
        </>
      ) : (
        isDefined(sharing) && (
          <>
            <StyledDescription>{description}</StyledDescription>
            {!sharing.isEnabled && sharing.permissions.canUpdate && (
              <StyledDescription>{t`Sharing is unavailable for this workspace. Existing access is unchanged; you can still remove people and roles.`}</StyledDescription>
            )}
            {sharing.hasInheritedAccess && (
              <StyledDescription>{t`Access can also come from related records. Removing direct access does not remove inherited access.`}</StyledDescription>
            )}
            {shares.some(
              (share) =>
                share.principalType === RecordSharePrincipalType.EVERYONE &&
                share.rowCause !== RecordShareRowCause.MANUAL,
            ) && (
              <StyledDescription>{t`An application also gives everyone access. Direct sharing changes do not remove that access.`}</StyledDescription>
            )}
            {sharing.permissions.canUpdate ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuHeader>{t`General access`}</DropdownMenuHeader>
                <DropdownMenuItemsContainer>
                  <RecordSharingAction
                    text={t`Restricted`}
                    contextualText={t`Only people with direct or inherited access`}
                    LeftIcon={isSharedWithEveryone ? undefined : IconCheck}
                    disabled={
                      saving ||
                      !shares.some(
                        (share) =>
                          share.principalType ===
                            RecordSharePrincipalType.EVERYONE &&
                          share.rowCause === RecordShareRowCause.MANUAL,
                      )
                    }
                    onClick={() => {
                      void setShare({
                        principal: { everyone: true },
                        enabled: false,
                      });
                    }}
                  />
                  <RecordSharingAction
                    text={t`Everyone in the workspace`}
                    contextualText={
                      shares.some(
                        (share) =>
                          share.principalType ===
                            RecordSharePrincipalType.EVERYONE &&
                          share.accessLevel !== RecordShareAccessLevel.READ,
                      )
                        ? t`Editor`
                        : t`Viewer`
                    }
                    LeftIcon={isSharedWithEveryone ? IconCheck : IconUsers}
                    disabled={!canAdd || isSharedWithEveryone}
                    onClick={() => {
                      void setShare({
                        principal: { everyone: true },
                        enabled: true,
                      });
                    }}
                  />
                </DropdownMenuItemsContainer>
                <DropdownMenuSeparator />
                <DropdownMenuHeader>{t`People and roles with access`}</DropdownMenuHeader>
                <DropdownMenuItemsContainer hasMaxHeight>
                  {shares
                    .filter(
                      (share) =>
                        share.principalType !==
                        RecordSharePrincipalType.EVERYONE,
                    )
                    .map((share) => {
                      const member = currentWorkspaceMembers.find(
                        (item) => item.id === share.principalId,
                      );
                      const role = sharing.roles.find(
                        (item) => item.id === share.principalId,
                      );
                      const label =
                        share.principalId === currentWorkspaceMember?.id
                          ? t`You`
                          : share.principalType ===
                              RecordSharePrincipalType.ROLE
                            ? (role?.label ?? t`Deleted role`)
                            : isDefined(member)
                              ? `${member.name.firstName} ${member.name.lastName}`.trim() ||
                                member.userEmail
                              : t`Deleted member`;
                      return (
                        <MenuItem
                          key={share.id}
                          text={label}
                          contextualText={
                            share.rowCause === RecordShareRowCause.OWNER
                              ? t`Owner`
                              : share.rowCause ===
                                  RecordShareRowCause.APPLICATION
                                ? t`Provided by application`
                                : share.accessLevel ===
                                    RecordShareAccessLevel.READ
                                  ? t`Viewer`
                                  : t`Editor`
                          }
                          LeftIcon={
                            share.principalType ===
                            RecordSharePrincipalType.ROLE
                              ? IconLock
                              : IconUsers
                          }
                          iconButtons={
                            share.rowCause === RecordShareRowCause.MANUAL ? (
                              <LightIconButton
                                aria-label={t`Remove ${label}`}
                                disabled={saving}
                                onClick={() => {
                                  void setShare({
                                    principal:
                                      share.principalType ===
                                      RecordSharePrincipalType.ROLE
                                        ? { roleId: share.principalId }
                                        : {
                                            workspaceMemberId:
                                              share.principalId,
                                          },
                                    enabled: false,
                                  });
                                }}
                              >
                                <IconX />
                              </LightIconButton>
                            ) : undefined
                          }
                        />
                      );
                    })}
                </DropdownMenuItemsContainer>
                {sharing.isEnabled && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSearchInput
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t`Add people or roles`}
                    />
                    <DropdownMenuItemsContainer hasMaxHeight>
                      {availableMembers.length === 0 &&
                        availableRoles.length === 0 && (
                          <StyledDescription>{t`No matching people or roles`}</StyledDescription>
                        )}
                      {availableMembers.map((member) => (
                        <RecordSharingAction
                          key={member.id}
                          text={
                            `${member.name.firstName} ${member.name.lastName}`.trim() ||
                            member.userEmail
                          }
                          contextualText={member.userEmail}
                          LeftIcon={IconUsers}
                          disabled={!canAdd}
                          onClick={() => {
                            void setShare({
                              principal: { workspaceMemberId: member.id },
                              enabled: true,
                            });
                          }}
                        />
                      ))}
                      {availableRoles.map((role) => (
                        <RecordSharingAction
                          key={role.id}
                          text={role.label}
                          contextualText={t`Role`}
                          LeftIcon={IconLock}
                          disabled={!canAdd}
                          onClick={() => {
                            void setShare({
                              principal: { roleId: role.id },
                              enabled: true,
                            });
                          }}
                        />
                      ))}
                    </DropdownMenuItemsContainer>
                  </>
                )}
              </>
            ) : (
              <StyledDescription>{t`You have view-only access. Ask someone with edit access to change sharing.`}</StyledDescription>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItemsContainer>
              <RecordSharingAction
                text={t`Copy link`}
                LeftIcon={IconLink}
                onClick={() => {
                  void copyToClipboard(recordUrl);
                }}
              />
            </DropdownMenuItemsContainer>
          </>
        )
      )}
    </DropdownContent>
  );
};
