# Editor and comments — behavior spec

Card: SAN-135. Phase: public docs only (vendor help center, knowledge base, REST and document
format reference). Nothing observed live yet; every rule below is `documented`.

## Purpose

The description and every comment share one rich text editor. Someone used to the reference
tracker should get the same typing shortcuts, the same @mention flow and the same comment life
cycle (post, edit, delete, react, reply, link). Look and copy are santi's own.

## Sources

`documented`: [MD] markdown and keyboard shortcuts page, [CM] watch, share and comment page,
[SR] quick-reply suggestions page, [JE] service desk edit and share page (comment edit, delete,
restrict, permalink), [TH] knowledge base on threaded replies and the all/comments tabs, [RP]
vendor community article on comment replies (search summary only, page body not retrievable
without a browser), [KM] cloud knowledge base on mentions and autocomplete, [KE] cloud knowledge
base on missing mention emails, [LIM] work item field limits, [LC] migration knowledge base on
the 32,767 character cap, [ADF] document format reference (structure, mention, heading, code
block, link mark), [API] REST v3 intro, issue comments group and OpenAPI file, [US] REST v3 user
search (browse-permission search). Cross-refs: [UI] `ui-layout.md`, [OR] `organizations.md`.

## Rules

Editor surface and typing
- ED-1 One editor serves the description, comments and every multi-line rich text field; same
  shortcuts and formatting everywhere. `documented` [MD][API]
- ED-2 Markdown typed inline converts as the viewer types: double asterisk or double underscore
  for bold, single asterisk or underscore for italic, double tilde for strikethrough, backticks
  for inline code, bracket-then-parenthesis for a link, bang-bracket-parenthesis for an image by
  URL, one to six hashes plus space for heading levels. `documented` [MD]
- ED-3 Block triggers at line start: asterisk or dash for a bullet list, "1." or "2)" for a
  numbered list, empty square brackets plus space for an action item, greater-than for a quote,
  three dashes or three asterisks for a horizontal rule, three backticks for a code block, colon
  name colon for an emoji. A double asterisk at line start does not make a nested list.
  `documented` [MD]
- ED-4 Tab indents a list item, Shift+Tab outdents it (bullet, numbered and action items).
  `documented` [MD]
- ED-5 Formatting keys, Cmd on mac, Ctrl elsewhere: B bold, I italic, U underline, Shift+S
  strikethrough, Shift+M inline code, Shift+K link, Shift+7 numbered list, Shift+8 bullet list,
  Shift+9 quote, Shift+minus divider, backslash clear formatting, Z undo, Shift+Z redo. Underline
  has a key but no markdown trigger. `documented` [MD]
- ED-6 Editor keys only win over the browser's own when focus is inside the editor.
  `documented` [MD]
- ED-7 Three inline triggers open pickers: `@` mention, `:` emoji, `/` quick insert (code,
  emoji, images, tables and more). The slash menu is the one entry point for every block type.
  `documented` [MD]
- ED-8 Cmd/Ctrl+Option/Alt+Z shows the changes made in the current edit. `documented` [MD]

Paste
- ED-9 Pasted content is converted on the fly: links, code and raw markdown become formatted
  content. `documented` [MD][CM]
- ED-10 Cmd/Ctrl+Shift+V pastes as plain text, no conversion. `documented` [MD]
- ED-11 Conversion is one way: markdown in, never rich content back out to raw markdown.
  `documented` [MD]

Limits
- ED-12 One rich text entry (a description, one comment) is capped at 1 MB of stored content;
  the cap is fixed, not configurable. `documented` [LIM]
- ED-13 A 32,767 character cap on description and comment text is also stated for the cloud
  product; it cannot be lifted. `documented` [LC] (see OQ-1)
- ED-14 A work item holds at most 5,000 comments; adding past that fails with a too-large
  response, from both screen and API. `documented` [LIM][API]

Document model and rendering
- ED-15 Rich text is a tree: a root document with a version number holds block nodes; blocks
  hold inline nodes; inline text carries marks. Order is one path, reading the tree in sequence
  gives the text in order. `documented` [ADF]
- ED-16 Block kinds: paragraph, heading (level 1 to 6), bullet list, numbered list, list item,
  quote, code block, horizontal rule, table (rows, header cells, cells), panel, expand section,
  media. Inline kinds: text, hard line break, mention, emoji, smart link card, status, date.
  `documented` [ADF]
- ED-17 Marks on text: bold, italic, underline, strikethrough, inline code, link, text color,
  background color, sub/superscript. `documented` [ADF]
- ED-18 A link mark needs a target URL and may carry a title. `documented` [ADF]
- ED-19 A code block may carry a language, a wrap-long-lines flag and a hide-line-numbers flag;
  its content is plain text only, no marks. `documented` [ADF]
- ED-20 A heading holds inline content only and sits at the top level of the document.
  `documented` [ADF]
- ED-21 The published schema may list nodes or marks the product does not accept; the reference
  pages are the source of truth for what is valid. `documented` [ADF]

Mentions
- ED-22 Typing `@` followed by part of a name opens a person list; picking one inserts the
  mention. `documented` [CM][MD][JE]
- ED-23 The list is people who can browse that work item, matched by prefix on display name or
  e-mail. Someone without browse rights on the item cannot be mentioned there (issue-level
  security included). `documented` [KM][US]
- ED-24 Listing people at all needs the author to hold the site-wide browse-users right; without
  it no list opens. `documented` [KM][KE]
- ED-25 The mentioned person is notified when the description or comment is saved, not while
  typing; the alert links back to the work item. `documented` [CM][JE]
- ED-26 The mention alert respects the recipient's own notification setting for being
  mentioned; and it is only sent when the author holds browse-users right. `documented` [KE]
- ED-27 Stored mention: an inline node with a required account id, an optional display text
  captured at insert time, an optional access level (none, site, application, container) and an
  optional user kind (default, special, app). The id may also be a collection name instead of a
  person. `documented` [ADF]
- ED-28 Person search results carry an active flag, so deactivated accounts are known to the
  API. `documented` [US] (rendering: OQ-6)

Comments
- ED-29 Pressing M on the work item puts focus straight into the comment field. `documented`
  [CM][UI-38]
- ED-30 Quick-reply suggestions sit with the comment box in a row that scrolls sideways.
  Picking one drops its text into the box; it is not posted. The author may add to it, then save
  to post. Typing anything hides the row. A site admin can switch the feature off for everyone.
  An AI tier replaces the fixed texts with prompts that draft a longer reply. `documented` [SR]
- ED-31 Posting needs browse rights plus the add-comment right on the project. `documented`
  [JE][API]
- ED-32 Commenting or updating an item makes the author a watcher, unless the personal
  auto-watch preference is off. `documented` [CM][JE]
- ED-33 Edit and delete live in a per-comment more-actions menu that shows on hover.
  `documented` [CM][JE]
- ED-34 Edit opens the comment in the editor; on save an edited marker sits beside the
  timestamp; hovering the marker tells who edited and when. `documented` [JE]
- ED-35 Edit right: edit-own for the author, edit-all for anyone else; both also need view
  rights on the item and on the comment's visibility. `documented` [API][OR-28]
- ED-36 Delete asks for confirmation in a dialog before removing. `documented` [JE]
- ED-37 Delete right: delete-own for the author, delete-all for anyone else; same view
  conditions as edit. `documented` [API][OR-28]
- ED-38 A comment may be restricted to a group or a project role; only members see it.
  `documented` [JE][API]
- ED-39 An update may be sent without notifying anyone (API flag, defaults to notify).
  `documented` [API]
- ED-40 Reactions: one-click thumbs up under each comment, plus an add-reaction control that
  opens a short popular set and the full emoji picker. `documented` [CM]
- ED-41 Replies: a reply nests under the comment it answers instead of joining the top level.
  A reply inherits its parent's visibility and cannot change it. `documented` [TH][API]
- ED-42 A long thread shows the first and the latest reply; the middle ones hide behind a
  show-more control. `documented` [RP] (see OQ-9)
- ED-43 Activity has two views: all activity in time order (replies included as plain entries)
  and comments only, threaded. `documented` [TH]
- ED-44 One reverse-direction control flips activity between oldest-first and newest-first; the
  viewer can switch any time. `documented` [CM]
- ED-45 Copy link sits in the comment's more-actions menu; the link opens the work item scrolled
  to that comment. `documented` [CM][JE]

API representation
- ED-46 Description, comment body and multi-line text fields travel as the rich document tree
  (ED-15) in the current API version; single-line text fields stay plain strings.
  `documented` [API]
- ED-47 The older API version exposes the same operations but without the document tree; bodies
  are strings in the legacy wiki markup. `documented` [API][KM]
- ED-48 A comment record holds: id, self URL, author, last updater, created and updated
  timestamps, body, optional visibility, optional properties, and an optional HTML rendering on
  request. `documented` [API]
- ED-49 Listing comments pages with offset and size (default 100 per page) and orders by
  creation date, ascending unless a minus prefix asks for descending. `documented` [API]
- ED-50 Comment list and read can be done anonymously when the project allows it; each comment
  is returned only if the caller passes browse, issue security and visibility checks.
  `documented` [API]

## Open questions

- OQ-1 Size cap: 1 MB of stored content [LIM] vs 32,767 characters [LC]. Which one fires first
  for the editor and the API, and does the editor warn before save?
- OQ-2 Headings: inline markdown gives levels 1 to 6 [MD], yet the comment page says comments
  take level 2 to 5 [CM]. Are levels 1 and 6 refused, downgraded, or just unlisted in comments?
- OQ-3 Description edit mode: how it opens (click on text, empty-state prompt, `e` key), whether
  it saves on blur, and the keys for save and cancel. Docs do not say.
- OQ-4 Toolbar layout and grouping (text style menu, bold, italic, more formatting, lists, code,
  link, emoji, undo/redo) is not described anywhere public.
- OQ-5 Empty description state and placeholder behavior: not described.
- OQ-6 Mention of a deactivated or removed person: does it render greyed, as stale display
  text, or as an unknown user? Only the active flag is documented.
- OQ-7 Mention picker keys (arrows, Enter, Tab, Escape), result count, ordering (recent
  collaborators first?) and empty-result state: not documented for cloud. A server-side note
  says Tab and click select.
- OQ-8 Does a mention add the person as a watcher, or only notify? Docs only say notify.
- OQ-9 Thread collapse (ED-42) comes from a community article read only as a search summary;
  needs live confirmation. Reply depth (one level or deeper) and who may reply are unknown.
- OQ-10 Collapsed vs expanded composer: the collapsed look, what expands it, and whether the
  quick-reply row shows only while collapsed.
- OQ-11 Comment timestamp: relative ("n minutes ago") vs absolute, the switch-over age, and
  what hover shows.
- OQ-12 Deleting a comment that has replies: are the replies removed, kept, or orphaned?
- OQ-13 Edited marker: is it set by any save, or only when the body really changed? Is history
  of earlier bodies kept anywhere?
- OQ-14 Reactions: who reacted (list on hover?), limit per person, toggle off by clicking again.
- OQ-15 Permalink shape and whether the target comment is highlighted on arrival.
- OQ-16 Collection-name mentions (ED-27): which collections exist (team, everyone?) and who gets
  notified.
- OQ-17 Posting key: Cmd/Ctrl+Enter to save a comment or description is not documented.
