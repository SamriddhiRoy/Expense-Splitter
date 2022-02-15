import { io, Socket } from 'socket.io-client';
import type { Group } from './api';

const SOCKET_URL = 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
	if (!socket) {
		socket = io(SOCKET_URL, { transports: ['websocket'] });
	}
	return socket;
}

export function connectToGroup(
	groupId: string,
	onUpdate: (group: Group) => void,
	onError?: (message: string) => void
) {
	const s = getSocket();
	const handleUpdate = (data: Group) => onUpdate(data);
	const handleError = (payload: { error: string }) => onError?.(payload.error);
	s.on('group_updated', handleUpdate);
	s.on('error_message', handleError);
	s.emit('join_group', { groupId });
	return () => {
		s.off('group_updated', handleUpdate);
		s.off('error_message', handleError);
	};
}


