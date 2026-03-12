import type { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export function registerSocketServer(server: SocketServer) {
  io = server;
}

export function emitSocketEvent(event: string, payload: unknown) {
  io?.emit(event, payload);
}
