# Organizations and workspaces — behavior spec

Card: SAN-58 (E11), part 1. Phase: read-only observation of the maintainer's own site and its admin
console, plus the vendor's public docs. Nothing was changed: no setting, user, permission, invite or
product access. The invite form was opened and closed without sending.

## Purpose

How the reference tracker separates tenants: who an account is, which container owns users and
billing, where projects live, how people get in, which roles exist at each level, what is unique
where, and how a tenant starts and ends.

## Sources

Live, maintainer's session, 2026-10-16:
- [L1] Site REST reads: tenant id, server info, current user with groups and app roles, app roles,
  project list with type and privacy flags, role list, permission schemes, user and group lists,
  board list, license plan, global configuration.
- [L2] Project key and name validation endpoints, probed with valid, taken and malformed values.
- [L3] Access-level reads for two team-managed projects (SAN, LAB) and role actors of SAN.
- [L4] Admin console: organization picker, organization overview, users list, two user detail
  pages (one active, one invited), invite form (opened, not sent), groups, domains, apps, app
  access settings, app URLs, organization profile, user counts.
- [L5] Cross-product home page and its site/app switcher.
- [L6] Project access pages of SAN and LAB (team-managed) and people page of PRM (company-managed).
- [L7] URL probes: board and issue paths with right, wrong, lower-case and unknown keys and ids.

Live, maintainer's session, 2026-10-16, card SAN-70 (same read-only rule; row menus were opened and
closed without choosing an item, no dialog was opened):
- [L8] Admin project pages: project directory, trash and archive lists, and the row menus of the
  directory (one team-managed, one company-managed project) and of the trash.
- [L9] REST reads on the two trashed projects: project search by status, project by key and by id,
  key and name checks, items by key and by id, search by project, board list and boards by id,
  saved filters.
- [L10] URL probes into a trashed project: an item path, a team-managed board path and a
  company-managed board path.
- [L11] Own row on the SAN access page (the maintainer is its only member and admin).

Docs (support.atlassian.com):
- [D1] /organization-administration/docs/what-is-an-atlassian-organization/
- [D2] /organization-administration/docs/get-started-with-an-atlassian-organization/
- [D3] /organization-administration/docs/how-many-instances-of-a-product-does-my-organization-need/
- [D4] /organization-administration/docs/can-i-change-the-url-used-to-access-a-product/
- [D5] /organization-administration/docs/delete-an-atlassian-organization/
- [D6] /organization-administration/docs/transfer-products-to-another-organization/
- [D7] /user-management/docs/make-atlassians-global-account-model-work-for-you/
- [D8] /user-management/docs/what-are-the-different-types-of-admin-roles/
- [D9] /user-management/docs/invite-a-user/
- [D10] /user-management/docs/control-how-users-get-access-to-products/
- [D11] /user-management/docs/approve-or-deny-product-access-requests/
- [D12] /user-management/docs/how-does-product-access-work/
- [D13] /user-management/docs/default-groups-and-permissions/
- [D14] /user-management/docs/create-groups/ and /user-management/docs/delete-a-group/
- [D15] /user-management/docs/remove-or-suspend-a-user/
- [D16] /jira-software-cloud/docs/manage-how-people-access-your-team-managed-project/
- [D17] /jira-software-cloud/docs/next-gen-permissions/
- [D18] /jira-software-cloud/docs/add-people-to-team-managed-projects/
- [D19] /jira-cloud-administration/docs/what-is-the-free-jira-cloud-plan/
- [D20] /jira-cloud-administration/docs/permissions-limitations-in-free-jira-sites/
- [D21] /jira-cloud-administration/docs/invite-guests-to-jira/ and /guest-permissions-in-jira/
- [D22] /jira-cloud-administration/docs/edit-a-projects-details/
- [D23] /jira-cloud-administration/docs/create-and-edit-a-project/
- [D24] /jira-cloud-administration/docs/data-limits-and-guardrails/
- [D25] /jira-cloud-administration/docs/explore-jira-cloud-plans/
- [D26] /jira-software-cloud/docs/delete-project/ and /jira-cloud-administration/docs/archive-a-project/
- [D27] /jira-cloud-administration/docs/space-access-and-configuration-permissions/
- [D28] /jira-cloud-administration/docs/trash-for-jira-cloud-projects/, /move-a-project-to-trash/,
  /restore-a-project-from-trash/ and /delete-a-project/
- [D29] /jira-cloud-administration/docs/hide-a-project/
- [D30] /atlassian-account/docs/delete-your-atlassian-account/

Context of the live site: one site on the Free plan with a 10-seat limit and 2 accounts, 11
projects (9 company-managed, 2 team-managed), 20 boards. The maintainer's account belongs to 5
organizations and sees 2 sites in the switcher.

## Entities

- **Account**: one global identity (email, display name, locale, time zone). Exists apart from any
  tenant and logs in to all of them.
- **Organization**: the admin boundary. Owns the user directory, groups, admin roles, invite and
  domain policies, security and billing. Identified by an opaque id; has a display name.
- **Site**: one URL (subdomain) inside one organization. Hosts one instance of each app added to it.
  Identified by an opaque cloud id and its subdomain.
- **App instance**: the tracker on one site. Holds projects, boards, global settings and in-app
  permissions.
- **Project** (the vendor's UI and docs now say "space"): a container of work items with a key.
  Two kinds: team-managed (settings local to the project) and company-managed (settings from
  shared schemes run by app admins).
- **Membership in the organization**: account + status (active, invited, suspended) + one role per
  app (none, user, app admin) + admin roles + groups.
- **Group**: an organization-level set of accounts used to grant app roles and in-app permissions.
- **Project role**: a named bundle of project permissions; people and groups are its actors.
- **Access level** (team-managed only): which role everyone on the site gets in a project.
- **Invite**: an email-addressed grant, pending until the person signs in.
- **Invitation link**: a per-app shareable link, anyone holding it joins.
- **Approved domain**: an email domain whose owners may join or request access without an invite.
- **Access request**: a person without access asking for it; queued for admins.

## Rules

Tenancy
- OR-1 Three levels nest: organization → site → app instance → project. A site belongs to exactly
  one organization; an organization may hold several sites; each paid or free plan gives one app
  instance. `documented` [D1][D3]; `observed` [L4]: the apps page lists each app with its site URL;
  this organization has one site.
- OR-2 Accounts are global. One login reaches every organization and site the account was added
  to; no tenant owns the account unless it claims it (OR-4). `documented` [D1][D7]; `observed`
  [L4][L5]: one account picks among 5 organizations in the console and switches between 2 sites in
  the switcher.
- OR-3 Organization display names are not unique. Two of the 5 organizations show the same name and
  differ only by id. Renaming keeps the id. `observed` [L4]; `documented` [D2]
- OR-4 Account type is per organization: managed (the organization verified the email domain and
  claimed the account) or external (all others). One account can be managed in one organization
  and external in another. Only managed accounts can be edited, deactivated or deleted by the
  organization. `documented` [D1][D7]; `observed` [L4]: both users here are external, 0 managed,
  no verified domain.
- OR-5 Joining the organization and using an app are separate. A user holds a role per app (none,
  user, app admin); administering an app and using it are distinct rows, so a person can configure
  the tracker without a seat or use it without admin rights. `observed` [L4]: the user detail lists
  one row per app with plan and role, and the tracker's use and its administration are separate
  rows; `documented` [D8][D12]
- OR-6 The site has a user limit per plan: up to 10 on Free, up to 100,000 on paid plans. Going over
  the Free limit through access settings moves the app to a paid trial. `documented` [D25][D10];
  `observed` [L1][L4]: plan Free, 10 seats, 2 users.

URLs
- OR-7 Site URL is a subdomain of the vendor's domain, chosen from the site name at signup. App
  pages live under paths of that host. `documented` [D2]; `observed` [L1][L4]
- OR-8 Site URL changes: organization admins only, need at least one paid app on the site, at most 3
  changes, the old URL keeps redirecting and can never be taken again, and the change applies to
  every app on the site. Sites with only Free apps can never rename. `documented` [D4][D19];
  `observed` [L4]: the app URLs page offers a URL update for the site.
- OR-9 Organization and site ids appear in admin and home URLs as opaque ids; the home page opens on
  the last used organization and site, carried in its path and query. `observed` [L4][L5]
- OR-10 Project and board paths carry the project key and a numeric board id; issues are addressed
  by their key. Company-managed board paths get an extra path segment that team-managed ones lack.
  `observed` [L7]
- OR-11 Board ids are numbered across the whole site, not per project (ids 2 to 46 across 11
  projects). A board id opened under another project's key is redirected to the owning project's
  path. `observed` [L1][L7]
- OR-12 A lower-case key in an issue path is rewritten to upper case and the issue opens. `observed`
  [L7]
- OR-13 An unknown project key, or a board id that does not exist, lands on a project-not-found
  page that carries the requested key. `observed` [L7]

Invites and joining
- OR-14 An invite addresses one email. If an account already uses it, that account joins;
  otherwise the person creates one on acceptance. Inviting never transfers ownership of the account
  to the organization. `documented` [D9]
- OR-15 The invite form takes several emails at once, refuses distribution lists, offers an
  optional admin role (default none), one role per app (each app preselected with the user role,
  administration preselected with none), optional groups, and an optional personal message;
  sending the email is optional. `observed` [L4]; `documented` [D9]
- OR-16 An invited person appears in the directory at once, with an invited status, the invite
  date and the roles already granted; admins can resend the invite. `observed` [L4]
- OR-17 Who may invite: organization admins and per-app user-access admins always; other users per
  app as set by admins: anyone, approved domains only, request-only (an admin approves), or no
  one. `documented` [D10]
- OR-18 Invitation links: one link per app, usable by anyone who has it, valid 30 days, can be
  turned off or regenerated at any time. `documented` [D10]
- OR-19 Approved domains: emails on a listed domain join an app without an invite or, if approval
  is required, through a request. A catch-all rule covers every other domain and by default allows
  requests. Accounts joining this way must reconfirm their account every 6 months. `documented`
  [D10]; `observed` [L4]: the access settings show only the catch-all rule, applied to 3 apps.
- OR-20 Access requests: a person who opens an app without access is offered a request; existing
  users may also request for someone else. Requests from every site collect in one queue;
  organization and site admins approve or deny. A denied person cannot ask again. `documented`
  [D11]; `observed` [L4][L6]: an empty queue in the console, and an access-requests tab on each
  project's people page.
- OR-21 A project can only add people already on the site (or groups). Strangers must first be
  invited to the site by an admin. `documented` [D18]
- OR-22 Two accounts with different emails can never be merged; work stays with the account that
  did it. `documented` [D9]

Admin roles
- OR-23 Admin roles: organization admin (users, groups, apps, security; the highest), site admin
  (apps and integrations of one site), user-access admin (who may use one app; gets no access to it
  by default), app admin (configures one app; no console access). One person can hold several.
  `documented` [D8]; `observed` [L4]: the maintainer is organization admin and site admin.
- OR-24 Whoever creates the organization becomes its admin. Only organization admins grant or
  remove organization, site and user-access admin roles, and for the tracker also its app admin
  role. Having two or more organization admins is advised. `documented` [D8]; `observed` [L4]: both
  users, including the invited one, hold the organization admin role.
- OR-25 The organization admin role alone gives neither app use nor app settings; the system adds
  the user and app admin roles separately, and they can be taken away. `documented` [D8];
  `observed` [L4]: the maintainer's rows show app admin on most apps and plain user on the tracker.
- OR-26 Site-level tracker admins always reach every project's settings, whatever the project's
  access or membership. `documented` [D16][D18]

Project roles and access
- OR-27 Every team-managed project has three built-in roles (administrator, member, viewer) that
  cannot be edited or deleted, plus two system roles: a guest role and an integration role for
  connected apps. `observed` [L1][L3]: SAN lists these five, the maintainer is the only actor, in
  the administrator role; `documented` [D16]
- OR-28 Built-in role rights: viewer browses, views, comments, attaches and edits or deletes its own
  comments and attachments; member adds creating, editing, assigning, moving between statuses,
  linking, logging work, running sprints, due dates and seeing watchers; administrator adds
  project settings and people, deleting any item, comment, attachment or work log, editing reporter
  and managing watchers. `documented` [D17]
- OR-29 Viewer needs no paid seat; member and administrator need app use for their rights to work.
  `documented` [D16]
- OR-30 Paid plans may add custom roles (from scratch or as a copy of another role). A person or
  group can hold several roles; extra roles add rights to the role given by the access level and
  never remove them. Deleting a role keeps its people in the project. `documented` [D16][D18]
- OR-31 Team-managed access levels: open (everyone on the site gets member), limited (everyone gets
  viewer), private (only added people and tracker admins; hidden from the project directory and
  search). Anonymous access is not possible. `documented` [D16][D17]
- OR-32 On a site that was always Free, roles and access cannot be customised: a fourth level makes
  everyone with tracker access an admin of every project. A site that downgrades keeps its
  permissions frozen. `documented` [D19][D20]; `observed` [L3][L6]: SAN reports this
  everyone-admin level, LAB reports open; both access pages show one role and an upgrade prompt.
  Why the two differ is OQ-3.
- OR-33 Company-managed projects take rights from shared permission schemes that map permissions to
  roles, groups or fields; app admins edit schemes, project admins only fill the roles. `documented`
  [D27]; `observed` [L1]: 2 shared schemes plus one generated scheme per team-managed project.
- OR-34 Guests: external collaborators limited to one project per site, no admin rights, no sprint
  management, no global rights; free up to 5 per paid user within the site's user limit; paid plans
  only; their email domain must not belong to the organization. `documented` [D21]; `observed`
  [L3]: the guest role exists on SAN with no actors.

Groups
- OR-35 Groups live in the organization and grant app roles (and in-app permissions) to all their
  members. Each app role has one default group; granting the role puts the user in it. The group
  that grants organization admin can never be a default group. `documented` [D12][D13]; `observed`
  [L1]: per app, separate groups for users, admins and user-access admins, named after the site;
  the tracker's user role defaults to its users group.
- OR-36 Deleting a group keeps its users; a group that is the default of a role cannot be deleted.
  `documented` [D14]

Scope and uniqueness
- OR-37 Project keys are unique per site: 2 to 10 characters, an upper-case letter first, then
  upper-case letters or digits. Lower-case input is rejected, not converted. A taken key is refused
  with the name of the project that holds it, and a free variant with a digit suffix is proposed.
  `observed` [L2]; `documented` [D22]
- OR-38 Changing a key keeps the old ones as aliases: old links and item keys still resolve, and
  an old key cannot be given to a new project until it is removed from the previous-keys list. Only
  organization, site and tracker admins change or delete keys. `documented` [D22]
- OR-39 A taken project name gets a numbered free variant from the name check; an unused name comes
  back unchanged. `observed` [L2]. See OQ-5.
- OR-40 Scope split: accounts, groups, admin roles, invite and domain policies, and access requests
  belong to the organization; global options (voting, watching, time tracking, sub-items) and
  boards belong to the site's app; access, roles and keys belong to the project. `observed`
  [L1][L4]; `documented` [D1][D12]
- OR-41 Site limits: 30,000 projects, 30 million work items, 2,000 project roles per user.
  `documented` [D24]

Lifecycle
- OR-42 Signing up for an app creates a site and an organization together; the site name becomes
  the subdomain. If the account already reaches other instances of that app, signup lists them
  first. An organization can also be created with no apps. `documented` [D2]
- OR-43 Creating projects: any user may create team-managed projects unless an admin withdraws that
  global right; company-managed ones need tracker admin. The key is generated from the name and
  can be edited; the creator becomes the owner. `documented` [D23]; `observed` [L1]: the
  maintainer holds the create right.
- OR-44 First screen for a returning user: a cross-product home of the last used organization and
  site, with a greeting, the apps the user can open, and empty recent-work lists when nothing was
  touched. `observed` [L5]
- OR-45 Removing a user from the organization ends access to all its apps, drops roles and groups,
  and keeps the account alive elsewhere; returning needs a new invite and new roles. Suspending is
  temporary and restores roles and groups on reactivation. Neither is billed. `documented` [D15]
- OR-46 Removing a person from a project does not remove them from the site; a group that holds a
  role in the project may still let them in. `documented` [D18]
- OR-47 Deleting a project moves it to a trash for 60 days, restorable by tracker admins, then gone
  for good. Archiving is a paid-plan feature. `documented` [D26]
- OR-48 The organization profile offers rename, transfer of all apps to another organization the
  admin manages, and deletion, which checks pending steps first and wipes all organization data.
  `observed` [L4]; `documented` [D5][D6]
- OR-49 Free sites may be deactivated after inactivity, after warning emails to site admins.
  `documented` [D19]

## Project lifecycle

Live context: the trash holds 2 projects (one team-managed, one company-managed), both moved there
by the maintainer on 2026-10-01; the archive is empty. OR-47 is the summary; the rules below detail
it.

States: live → trashed → live (restore) or gone (purge, manual or at day 60); live → archived →
live (restore). Gone is final. A project is never trashed and archived at once.

Trash
- OR-50 A project is live, trashed or archived; gone after a purge. The site lists projects by each
  of these three statuses separately. Trash and archive are both reversible; permanent deletion
  exists only from the trash, never straight from live. `observed` [L9]; `documented` [D26][D28]
- OR-51 Who may trash: tracker and site admins, any project kind; project admins only their
  team-managed projects. Restoring and permanent deletion are for tracker and site admins only;
  a project admin who trashed a project cannot bring it back alone. `documented` [D26][D28]
- OR-52 Trashing starts from the row menu of the admin project directory, which offers, for both
  project kinds, project settings, move to trash and archive. One confirmation dialog follows, with
  a single confirm action. `observed` [L8]: the menu; `documented` [D26][D28]: the dialog. The
  dialog's content was not opened (OQ-12).
- OR-53 The project's items, components, attachments and versions go to the trash with it.
  Configuration shared with other projects (schemes, workflows, item types) is left untouched.
  `documented` [D28]
- OR-54 A trashed project vanishes for everyone, admins included: it leaves the project directory
  (11 listed, the 2 trashed absent), the recent-projects list and the live project search. Reading
  it by key or by id answers not found. Its items, by key or by id, answer the same not-found that
  a missing permission gives. A search by its key returns an empty result with no error, exactly
  like an unknown key. `observed` [L8][L9]
- OR-55 Opening a trashed project's URLs: an item path shows the generic can't-show-this-project
  page (no permission or does not exist) with an access-request offer and other projects to open; a
  team-managed board path redirects to the project-not-found page carrying the key; a
  company-managed board path stays put, says the board cannot be opened because of its filter, and
  raises a project-not-found notice. `observed` [L10]. The docs say items stay openable read-only
  by direct link; see OQ-11.
- OR-56 Boards and saved filters of a trashed project survive. A board still answers by id with its
  name and type but loses its project location and drops out of the board list. The saved filter
  behind a board stays listed with its query still naming the trashed key. `observed` [L9]
- OR-57 The trash page sits in the tracker admin settings next to the project directory, project
  categories and the archive. One row per project: name, key, kind, lead, when and by whom it was
  trashed, and the time left before purge as a day count. The list has a text search and an app
  filter, and sorts by name, key, lead or trash date. Each row's menu offers immediate permanent
  deletion and restore. `observed` [L8]; `documented` [D28]
- OR-58 Purge happens exactly 60 days after trashing (same time of day). The countdown shows whole
  days: 45 on day 15. An admin may purge earlier from the row. Purging cannot be undone.
  `observed` [L8][L9]: both projects show a purge stamp 60 days after the trash stamp;
  `documented` [D26][D28]
- OR-59 Restoring returns the project to the directories and its items to search results. Legacy
  invalid parent links are not recovered. `documented` [D28]. Whether restore asks for confirmation
  was not seen (OQ-12).
- OR-60 A trashed project keeps its key, name, id and board ids. The key check refuses the key and
  names the trashed project as holder, proposing the key plus a digit; the name check proposes a
  numbered variant of the trashed name. `observed` [L9]

Archive
- OR-61 Archiving is for the top paid plans only. On Free the directory menu still lists it, marked
  with a plan badge, and the archive page opens empty. A site that downgrades keeps its archive and
  can restore from it but cannot archive more. `observed` [L8]; `documented` [D26]
- OR-62 Who may archive and restore: tracker and site admins, any project kind; project admins
  archive only team-managed projects. Archiving asks once for confirmation. The archive list and
  restore are for tracker and site admins. `documented` [D26]
- OR-63 Archived means frozen and out of search: the project's items, components, attachments and
  versions are archived with it; its items leave basic and advanced search but still open by direct
  link, read-only. People who had rights may still read the project's details through the API
  (schemes, owner, who archived and when); hiding those needs a permission change before archiving.
  Shared configuration is untouched. Restore drops legacy invalid parent links. `documented` [D26]
- OR-64 The archive page lists archived projects with name, key, kind, lead and archive date, an app
  filter, and a row menu to restore. `observed` [L8]: columns and filter on the empty list;
  `documented` [D26]: who archived and the restore action.
- OR-65 A softer option than archive or trash is hiding: an empty permission scheme makes the
  project invisible to everyone but admins. Not available on Free. `documented` [D29]

Leaving and the last admin
- OR-66 There is no self-service leave from a project, site or organization. On a project's access
  page the member's own row offers only the role picker, with no remove action. The ways out are an
  admin removing the person (OR-45, OR-46) or the person deleting their account: 14 days
  deactivated and cancellable, then gone, shown to others as a former user; the content they wrote
  stays. Accounts managed by an organization cannot self-delete. `observed` [L11]; `documented`
  [D18][D30]
- OR-67 No last-admin guard is documented for projects. A project cannot lose administration
  because tracker admins always reach every project's settings (OR-26). `documented` [D16][D18].
  Not tested: removing or demoting the sole project admin would change the project.

## santi today

santi has global users, global projects, project members with admin or member role, add-by-email
for existing accounts, and one-time invite links. No organization, site, group, viewer role or
access level.

| Rule | santi today |
|---|---|
| OR-1 | Missing. One instance is one tenant; projects hang off the instance. |
| OR-2 | Same in spirit: one account (unique lower-case email) reaches every project it is a member of, with no tenant above. |
| OR-3, OR-9 | Not applicable: no organization id or name. |
| OR-4 | Missing: no managed/external split, no domain claim. |
| OR-5 | Missing: membership is per project only; no per-app seat. |
| OR-6 | Missing: no user limit (free product, no billing in v1). |
| OR-7, OR-8 | Not applicable: self-hosted, the host is the operator's. |
| OR-10 | Partial: page paths carry the key (`/p/{key}/…`), issues by key number; the board has no id in the path (one board per project, D31). |
| OR-11 | Not applicable: no board id in URLs. |
| OR-12 | Unknown: lower-case key in page paths not checked here. |
| OR-13 | Different: unknown keys and non-members both get 404 (D28), no not-found page naming the key. |
| OR-14, OR-15, OR-16 | Different: invites are links, not emails (no SMTP); one role per invite (admin or member); no pending-user entry in the member list. Adding by email works only for existing accounts. |
| OR-17 | Partial: only project admins create invites or add members. |
| OR-18 | Different: links are per project, work once, expire in 7 days; a used link answers 410. |
| OR-19, OR-20 | Missing: no approved domains, no access requests. |
| OR-21 | Different: an admin can add any existing account by email; strangers need a link. |
| OR-22 | Same: emails are unique; no account merge. |
| OR-23, OR-24, OR-25, OR-26 | Missing: no instance-wide admin of any kind; project admin is the top role. |
| OR-27, OR-28 | Partial: admin and member exist with fixed rights (IA §9); no viewer, guest or integration role. Members may also run sprints, as in the reference. |
| OR-29, OR-34 | Missing: no seats, no guests. |
| OR-30 | Missing: one role per member, no custom roles. |
| OR-31, OR-32 | Different: every project is private in effect; only members see it, others get 404. |
| OR-33 | Not applicable: no shared schemes. |
| OR-35, OR-36 | Missing: no groups. |
| OR-37 | Partial: same shape and length, unique per instance; santi trims and upper-cases input instead of refusing it, and suggests no free variant. |
| OR-38 | Missing: keys cannot change; no aliases. |
| OR-39 | Different: names are 1 to 100 characters and need not be unique. |
| OR-40 | Partial: user and API tokens are per account (D23); everything else is per project. |
| OR-41 | Missing: no instance limits stated. |
| OR-42 | Different: open registration creates an account only; no tenant is created. |
| OR-43 | Same: any signed-in user creates a project, key derived from the name and editable, creator becomes admin. |
| OR-44 | Different: first run lands on an empty home that offers a new project (IA §8). |
| OR-45 | Partial: removing a member drops project access; nothing above the project to remove from. |
| OR-46 | Same at project level. The last admin cannot be removed or demoted. A member cannot leave a project alone: only admins remove members. |
| OR-47 | Missing: no project delete, trash or archive. |
| OR-48, OR-49 | Not applicable: no organization; self-hosted. |
| OR-50 to OR-65 | Missing: no project delete, trash, archive or hide. |
| OR-66 | Same: no self-service leave; only admins remove members. |
| OR-67 | Different: santi blocks removing or demoting the last project admin, since no instance admin exists above it. |

Main gaps if santi grows a tenant layer: a container above projects with its own admins, a viewer
role, project access levels (private today, open or limited as options), invites that make a
pending membership, key aliases, and self-service leave.

## Open questions

- OQ-1 Opening a board id under the wrong project key redirected to the owning project's path but
  ended on a view-not-found state, not the board. A lower-case key in a board path gave the same.
  Is the redirect meant to open the board, or is this a routing defect?
- OQ-2 Leaving: no self-service way for a user to leave an organization, site or project was found
  in the docs or the console. Is leaving only possible by an admin removing you, or by deleting
  the account?
  Answer (SAN-70): yes, both, and nothing else (OR-66). Still open: the own row lacked a remove
  action, but the maintainer is the sole member and admin of SAN, so it is unknown whether a
  plain member sees one for themselves.
- OQ-3 Two team-managed projects on the same always-Free site report different access levels (one
  everyone-admin, one open). Does the level depend on when the project was created, or on a past
  plan of the site?
- OQ-4 On the Free plan, can project admins still add people on the access page, and with which
  role, given that roles are not customisable? Not tried, it would change the project.
- OQ-5 The name check returned a numbered variant for a one-character name that no visible project
  uses. Is there a minimum length, or does a trashed project hold that name? Is a duplicate project
  name refused on creation, or only flagged?
  Answer (SAN-70), partial: trashed projects hold their names (OR-60), and the docs state project
  names are unique on the site, so a duplicate is refused, not just flagged. Neither trashed name
  is one character long, so the earlier one-character variant is still unexplained.
- OQ-6 Does a trashed project still hold its key and board ids?
  Answer (SAN-70): yes. Key, name, id and board ids stay taken while in the trash (OR-56, OR-60).
  Whether a purge frees them is OQ-13.
- OQ-7 What exactly can a pending invitee do before accepting, and does a pending invite expire?
  The docs give 30 days for invitation links but no lifetime for email invites.
- OQ-8 What the switcher lists when an account reaches several sites of the same organization
  versus sites of different ones: only 2 sites appeared for 5 organizations.
- OQ-9 The groups table did not render in the capture (17 counted in the console, 19 from the site
  API). Which groups the console hides is unknown.
- OQ-10 The user counts page is plan-gated; how seats are counted on Free (invited users included?)
  was not seen.
- OQ-11 Docs say a trashed project's items open read-only by direct link; on the live site the
  item path and item reads answered not found for the maintainer, an org and site admin. Is the
  doc stale, does it apply only to company-managed projects, or did the probed item numbers not
  exist?
- OQ-12 What the trash and archive confirmation dialogs show (consequences, purge date, typing the
  key), and whether restore and immediate permanent deletion ask for confirmation. Not opened.
- OQ-13 After a purge, are the key, name and board ids freed for reuse? Observable after
  2026-11-30, when both trashed projects purge.
- OQ-14 Does an archived project hold its key and name like a trashed one? No archived project
  exists on this Free site to probe.
