# Record sharing and effective permissions

Sharing is a property of a workspace record, addressed by object metadata ID and record ID. Applications such as chat must consume the same permission evaluation as the record API. There is no independent `canManage` permission: changing manual grants requires effective update access to the target record. Destroying or archiving a record continues to require its corresponding operation permission.

Effective access is the intersection of metadata readability/writability, role object permissions, licensed role row predicates, and record grants (including inherited access). A grant never bypasses a role restriction or a SYSTEM field. Capability responses describe these checks for the UI; mutations repeat them on the server.

## Privacy and rollout

Private and inherited records remain protected when the sharing rollout flag is off. The flag controls granting access and the visibility of the sharing UI, not whether private rows are filtered. All saved grants remain authoritative, including API-key creator grants. Turning the flag off hides the panel and prevents new invitations; it does not revoke access. Sharing itself is available to self-hosters without an Enterprise entitlement. Role row predicates retain their separate entitlement.

Changing this behavior requires migration coverage for existing records. Grant ownership before switching a thread from SYSTEM to PRIVATE readability, and preserve owner-only access for unmigrated legacy history. For legacy workspaces where the former sharing gate was disabled, the upgrade preserves existing PRIVATE/INHERITED record access with editable workspace-wide FULL grants. A transactional marker prevents retries from sharing newer records. Threads are excluded and receive trusted owner grants. APPLICATION readability is now enforced as declared; it is not converted into a user share. Internal messages, execution state and platform-maintained fields retain their SYSTEM protection. Never infer ownership from a mutable client-supplied field.

## Grant management

The generic sharing API validates the target within the authenticated workspace, evaluates effective update access, and serializes authorization and manual-grant changes in one transaction. Manual changes preserve OWNER and APPLICATION grants. The storage service supports read and update grants. The public invitation mutation currently grants read access only. It does not accept FULL access, so a writer cannot escalate destructive permissions through this API. Inherited or application access is shown as inherited and cannot be removed by deleting a manual grant.

The reusable panel accepts a record target and presentation copy. It has no chat-specific ownership or permission logic. The server returns effective access and sharing availability; the browser does not reference rollout flags or licensing decisions.

## Chat integration

Conversation APIs keep their domain responsibilities (stream coordination, billing, tool execution and message validation). Record access is delegated to the common policy. Rename and sharing changes use effective update permission. Execution additionally remains restricted to the original participant while queued messages lack independent actor attribution. Enabling multiplayer execution requires recording and authenticating each message author before lifting that boundary. Shared read access never permits execution. Realtime delivery must revalidate record access and terminate on revocation.

## Verification

Exercise the same read/update/delete matrix through ordinary record operations and sharing APIs: read-only grants, writable grants, role denial, field protection, cross-workspace targets, deleted members, application-owned records, inherited email/calendar parents, flag-off behavior, and concurrent revocation. Cover migration up/down, retained owner access, hidden execution data, and the reusable panel with at least a non-chat record.
