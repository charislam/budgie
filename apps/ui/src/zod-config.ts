import { z } from "zod/v4";

// Skip Zod's Function constructor probe in the MCP app's strict CSP sandbox.
// Load this before the MCP SDK constructs and validates its schemas.
z.config({ jitless: true });
