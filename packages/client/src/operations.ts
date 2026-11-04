import type { Client } from "./client";

/** Where an operation lives in a surface: a CLI command path or MCP tool name, or why it is not there. */
export type Surface = string | { not: string };

/**
 * Every client operation and the CLI command and MCP tool that expose it (ADR 0029).
 * Anything a human can do in the web UI must have both. Typechecking fails when a client method is added
 * without an entry here, and the cli and mcp tests fail when a named command or tool does not exist.
 * `not` is for operations the UI does not have and an agent should not or need not do; say why.
 */
export const OPERATIONS: Record<keyof Client, { cli: Surface; mcp: Surface }> = {
  me: { cli: "whoami", mcp: "whoami" },
  listUsers: { cli: "user list", mcp: "list_users" },
  createAgent: { cli: "agent create", mcp: { not: "humans only: agents cannot create agents" } },
  listProjects: { cli: "project list", mcp: "list_projects" },
  createProject: { cli: "project create", mcp: "create_project" },
  deleteProject: { cli: "project delete", mcp: { not: "humans only and irreversible; not in the web UI" } },
  listBoards: { cli: "board list", mcp: "list_boards" },
  getBoard: { cli: "board get", mcp: "get_board" },
  createBoard: { cli: "board create", mcp: "create_board" },
  renameBoard: { cli: "board rename", mcp: "rename_board" },
  deleteBoard: { cli: "board delete", mcp: "delete_board" },
  setLanes: { cli: { not: "exposed as the finer-grained lane operations" }, mcp: { not: "exposed as the finer-grained lane operations" } },
  addLane: { cli: "board lane add", mcp: "add_lane" },
  renameLane: { cli: "board lane rename", mcp: "rename_lane" },
  moveLane: { cli: "board lane move", mcp: "move_lane" },
  removeLane: { cli: "board lane remove", mcp: "remove_lane" },
  listTickets: { cli: "ticket list", mcp: "list_tickets" },
  getTicket: { cli: "ticket get", mcp: "get_ticket" },
  createTicket: { cli: "ticket create", mcp: "create_ticket" },
  updateTicket: { cli: "ticket update", mcp: "update_ticket" },
  moveTicket: { cli: "ticket move", mcp: "move_ticket" },
  transferTicket: { cli: "ticket transfer", mcp: "transfer_ticket" },
  claimNext: { cli: "ticket claim", mcp: "claim_next_ticket" },
  listComments: { cli: "ticket comments", mcp: "get_ticket" },
  addComment: { cli: "ticket comment", mcp: "add_comment" },
  listActivity: { cli: "activity", mcp: "list_activity" },
  listTokens: { cli: "token list", mcp: { not: "humans only: credentials are managed by people" } },
  createToken: { cli: "token create", mcp: { not: "humans only: credentials are managed by people" } },
  revokeToken: { cli: "token revoke", mcp: { not: "humans only: credentials are managed by people" } },
  watch: { cli: { not: "a live stream for the web board" }, mcp: { not: "a live stream for the web board" } },
};
