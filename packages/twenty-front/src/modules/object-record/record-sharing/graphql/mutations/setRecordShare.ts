import { gql } from '@apollo/client';

export const SET_RECORD_SHARE = gql`
  mutation SetRecordShare(
    $target: RecordSharingTargetInput!
    $principal: RecordSharePrincipalInput!
    $enabled: Boolean!
  ) {
    setRecordShare(target: $target, principal: $principal, enabled: $enabled) {
      permissions {
        canRead
        canUpdate
        canDelete
        canSoftDelete
      }
      isEnabled
      hasInheritedAccess
      shares {
        id
        principalId
        principalType
        accessLevel
        rowCause
      }
      roles {
        id
        label
      }
    }
  }
`;
