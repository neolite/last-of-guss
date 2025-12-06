import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { GameSession } from './GameSession.js';
import { randomUUID } from 'crypto';

export class GameServer {
  private sessions: Map<string, GameSession> = new Map();
  private defaultSessionId = 'prototype-session'; // Single session for prototype

  constructor(private app: FastifyInstance) {}

  async initialize() {
    console.log('[GameServer] Initializing WebSocket routes...');

    // Register WebSocket plugin
    await this.app.register(import('@fastify/websocket'));

    // WebSocket endpoint for prototype
    // In full version, this would be /ws/game/:sessionId
    this.app.get('/ws/game', { websocket: true }, (connection: { socket: WebSocket }, req) => {
      this.handleConnection(connection, req);
    });

    console.log('[GameServer] WebSocket routes registered at /ws/game');
  }

  private handleConnection(connection: SocketStream, req: any) {
    console.log('[GameServer] New WebSocket connection');

    // Generate player ID and name (in real version, get from JWT auth)
    const playerId = randomUUID();
    const playerName = `Player_${playerId.slice(0, 8)}`;

    // Get or create default session
    let session = this.sessions.get(this.defaultSessionId);
    if (!session) {
      session = new GameSession(this.defaultSessionId);
      this.sessions.set(this.defaultSessionId, session);
      console.log(`[GameServer] Created new session: ${this.defaultSessionId}`);
    }

    // Add player to session
    // In @fastify/websocket v11+, connection.socket may be undefined - use connection directly
    const socket = (connection as any).socket || connection;
    session.addPlayer(playerId, playerName, socket);

    // Clean up empty sessions periodically
    connection.on('close', () => {
      setTimeout(() => this.cleanupEmptySessions(), 5000);
    });
  }

  private cleanupEmptySessions() {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isEmpty()) {
        session.stop();
        this.sessions.delete(sessionId);
        console.log(`[GameServer] Cleaned up empty session: ${sessionId}`);
      }
    }
  }
}
