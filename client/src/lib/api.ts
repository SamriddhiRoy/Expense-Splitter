export type Member = { id: string; name: string };
export type Expense = {
	id: string;
	description: string;
	amount: number;
	paidBy: string;
	splitBetween: string[];
	createdAt: string;
};
export type Group = {
	id: string;
	name: string;
	members: Member[];
	expenses: Expense[];
	balances: Record<string, number>;
	settlements: { from: string; to: string; amount: number }[];
};

const API_BASE = 'http://localhost:3001';

export async function createGroup(name: string) {
	const res = await fetch(`${API_BASE}/groups`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name })
	});
	if (!res.ok) throw new Error('Failed to create group');
	return (await res.json()) as { id: string; group: Group };
}

export async function addMember(groupId: string, name: string) {
	const res = await fetch(`${API_BASE}/groups/${groupId}/members`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name })
	});
	if (!res.ok) throw new Error('Failed to add member');
	return (await res.json()) as { member: Member; group: Group };
}

export async function getGroup(groupId: string) {
	const res = await fetch(`${API_BASE}/groups/${groupId}`);
	if (!res.ok) throw new Error('Group not found');
	return (await res.json()) as { group: Group };
}

export async function addExpense(
	groupId: string,
	payload: { description: string; amount: number; paidBy: string; splitBetween: string[] }
) {
	const res = await fetch(`${API_BASE}/groups/${groupId}/expenses`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) {
		const msg = await res.text();
		throw new Error(msg || 'Failed to add expense');
	}
	return (await res.json()) as { group: Group };
}


