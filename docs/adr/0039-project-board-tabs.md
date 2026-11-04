# 39. Project–board tabs

- Status: accepted
- Date: 2026-11-04
- Supersedes: navigation in [ADR 0037](0037-project-boards.md), CLI-only project creation in [ADR 0029](0029-ui-features-exist-in-cli-and-mcp.md).

## Decision

- Show every accessible project–board pair as a header tab: `PROJECT Board`.
- Scroll tabs horizontally. Remember the selected project and board in the browser.
- Create projects and manage boards through CLI and MCP; UI management comes later.
- MCP adds `create_project`, using the existing contract and attributed core operation.

## Consequences

- The browser loads boards for every listed project on refresh.
- Columns and ticket transfers retain the model from ADR 0037.
