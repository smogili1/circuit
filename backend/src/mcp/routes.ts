/**
 * MCP Server REST API Routes
 */

import { Router, Request, Response } from 'express';
import { getMCPServerManager } from './server-manager.js';
import { CreateMCPServerInput, UpdateMCPServerInput } from './types.js';

const router = Router();

// Get manager instance
const getManager = () => getMCPServerManager();

/**
 * GET /api/mcp-servers
 * List all MCP servers
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const manager = getManager();
    const servers = await manager.list();
    res.json(servers.map(s => manager.toResponse(s)));
  } catch (error) {
    console.error('Failed to list MCP servers:', error);
    res.status(500).json({ error: 'Failed to list MCP servers' });
  }
});

/**
 * GET /api/mcp-servers/:id
 * Get a specific MCP server
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const manager = getManager();
    const server = await manager.get(req.params.id);
    if (!server) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }
    res.json(manager.toResponse(server));
  } catch (error) {
    console.error('Failed to get MCP server:', error);
    res.status(500).json({ error: 'Failed to get MCP server' });
  }
});

/**
 * POST /api/mcp-servers
 * Create a new MCP server
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const input: CreateMCPServerInput = req.body;

    if (!input.name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (!input.transport) {
      res.status(400).json({ error: 'Transport configuration is required' });
      return;
    }

    // Validate transport type
    const validTransports = ['stdio', 'sse', 'http'];
    if (!validTransports.includes(input.transport.type)) {
      res.status(400).json({ error: `Invalid transport type. Must be one of: ${validTransports.join(', ')}` });
      return;
    }

    // Validate transport-specific fields
    if (input.transport.type === 'stdio') {
      if (!input.transport.command) {
        res.status(400).json({ error: 'Command is required for stdio transport' });
        return;
      }
    } else {
      if (!('url' in input.transport) || !input.transport.url) {
        res.status(400).json({ error: 'URL is required for sse/http transport' });
        return;
      }
    }

    const manager = getManager();
    const server = await manager.create(input);
    res.status(201).json(manager.toResponse(server));
  } catch (error) {
    console.error('Failed to create MCP server:', error);
    res.status(500).json({ error: 'Failed to create MCP server' });
  }
});

/**
 * PUT /api/mcp-servers/:id
 * Update an MCP server
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates: UpdateMCPServerInput = req.body;
    const manager = getManager();
    const server = await manager.update(req.params.id, updates);

    if (!server) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.json(manager.toResponse(server));
  } catch (error) {
    console.error('Failed to update MCP server:', error);
    res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

/**
 * DELETE /api/mcp-servers/:id
 * Delete an MCP server
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const manager = getManager();
    const deleted = await manager.delete(req.params.id);

    if (!deleted) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete MCP server:', error);
    res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

/**
 * POST /api/mcp-servers/:id/test
 * Test connection to an MCP server
 */
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const manager = getManager();
    const result = await manager.testConnection(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Failed to test MCP server connection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test connection',
    });
  }
});

/**
 * POST /api/mcp-servers/:id/discover
 * Discover tools from an MCP server
 */
router.post('/:id/discover', async (req: Request, res: Response) => {
  try {
    const manager = getManager();
    const server = await manager.get(req.params.id);

    if (!server) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    const tools = await manager.discoverTools(req.params.id);
    res.json({
      serverId: req.params.id,
      tools,
      discoveredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to discover MCP tools:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to discover tools',
    });
  }
});

/**
 * PATCH /api/mcp-servers/:id/enable
 * Enable an MCP server
 */
router.patch('/:id/enable', async (req: Request, res: Response) => {
  try {
    const manager = getManager();
    const server = await manager.update(req.params.id, { enabled: true });

    if (!server) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.json(manager.toResponse(server));
  } catch (error) {
    console.error('Failed to enable MCP server:', error);
    res.status(500).json({ error: 'Failed to enable MCP server' });
  }
});

/**
 * PATCH /api/mcp-servers/:id/disable
 * Disable an MCP server
 */
router.patch('/:id/disable', async (req: Request, res: Response) => {
  try {
    const manager = getManager();
    const server = await manager.update(req.params.id, { enabled: false });

    if (!server) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.json(manager.toResponse(server));
  } catch (error) {
    console.error('Failed to disable MCP server:', error);
    res.status(500).json({ error: 'Failed to disable MCP server' });
  }
});

export default router;
