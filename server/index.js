const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());

// Allow any localhost/127.0.0.1 origin (any port) during local development
const devOriginAllowed = (origin) => {
	if (!origin) return true;
	return /^http:\/\/localhost:\d{1,5}$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin);
};

app.use(cors({
	origin: (origin, callback) => {
		if (devOriginAllowed(origin)) return callback(null, true);
		return callback(new Error('CORS: origin not allowed'));
	},
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: (origin, callback) => {
			if (devOriginAllowed(origin)) return callback(null, true);
			return callback(new Error('CORS: origin not allowed'));
		},
		methods: ['GET', 'POST'],
		credentials: true
	}
});

// In-memory store
const groupsById = new Map();

function generateId(prefix = '') {
	return prefix + Math.random().toString(36).slice(2, 8);
}

function ensureGroup(groupId) {
	const group = groupsById.get(groupId);
	if (!group) {
		const error = new Error('Group not found');
		error.status = 404;
		throw error;
	}
	return group;
}

function computeBalances(group) {
	const balances = new Map(); // memberId -> number
	for (const member of group.members) {
		balances.set(member.id, 0);
	}
	for (const expense of group.expenses) {
		const splitCount = expense.splitBetween.length;
		if (splitCount === 0) continue;
		const share = expense.amount / splitCount;
		// Paid by gets credited full amount
		balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amount);
		// Each participant owes their share
		for (const memberId of expense.splitBetween) {
			balances.set(memberId, (balances.get(memberId) ?? 0) - share);
		}
	}
	return balances;
}

function computeSettlements(group) {
	// Greedy settle: pair largest creditor with largest debtor until done
	const balances = computeBalances(group);
	const creditors = [];
	const debtors = [];
	for (const [memberId, amount] of balances.entries()) {
		// Round to cents to avoid float drift
		const rounded = Math.round(amount * 100) / 100;
		if (rounded > 0.009) creditors.push({ memberId, amount: rounded });
		else if (rounded < -0.009) debtors.push({ memberId, amount: rounded });
	}
	creditors.sort((a, b) => b.amount - a.amount);
	debtors.sort((a, b) => a.amount - b.amount); // most negative first

	const settlements = [];
	let i = 0, j = 0;
	while (i < creditors.length && j < debtors.length) {
		const c = creditors[i];
		const d = debtors[j];
		const pay = Math.min(c.amount, -d.amount);
		if (pay > 0.009) {
			settlements.push({
				from: d.memberId,
				to: c.memberId,
				amount: Math.round(pay * 100) / 100
			});
			c.amount = Math.round((c.amount - pay) * 100) / 100;
			d.amount = Math.round((d.amount + pay) * 100) / 100;
		}
		if (c.amount <= 0.009) i++;
		if (d.amount >= -0.009) j++;
	}
	return settlements;
}

function groupSnapshot(group) {
	const balances = Object.fromEntries(computeBalances(group));
	const settlements = computeSettlements(group);
	return {
		id: group.id,
		name: group.name,
		members: group.members,
		expenses: group.expenses,
		balances,
		settlements
	};
}

// REST endpoints
app.post('/groups', (req, res, next) => {
	try {
		const { name } = req.body ?? {};
		const id = generateId('g_');
		const group = {
			id,
			name: name || 'New Group',
			members: [],
			expenses: []
		};
		groupsById.set(id, group);
		res.status(201).json({ id, group: groupSnapshot(group) });
	} catch (err) {
		next(err);
	}
});

app.post('/groups/:groupId/members', (req, res, next) => {
	try {
		const { groupId } = req.params;
		const { name } = req.body ?? {};
		if (!name) {
			return res.status(400).json({ error: 'Member name is required' });
		}
		const group = ensureGroup(groupId);
		const existing = group.members.find(m => m.name.toLowerCase() === String(name).toLowerCase());
		if (existing) {
			return res.json({ member: existing, group: groupSnapshot(group) });
		}
		const member = { id: generateId('m_'), name: String(name) };
		group.members.push(member);
		io.to(`group:${group.id}`).emit('group_updated', groupSnapshot(group));
		res.status(201).json({ member, group: groupSnapshot(group) });
	} catch (err) {
		next(err);
	}
});

app.get('/groups/:groupId', (req, res, next) => {
	try {
		const { groupId } = req.params;
		const group = ensureGroup(groupId);
		res.json({ group: groupSnapshot(group) });
	} catch (err) {
		next(err);
	}
});

app.post('/groups/:groupId/expenses', (req, res, next) => {
	try {
		const { groupId } = req.params;
		const { description, amount, paidBy, splitBetween } = req.body ?? {};
		const group = ensureGroup(groupId);

		if (!description || typeof description !== 'string') {
			return res.status(400).json({ error: 'Description is required' });
		}
		const amt = Number(amount);
		if (!Number.isFinite(amt) || amt <= 0) {
			return res.status(400).json({ error: 'Amount must be a positive number' });
		}
		const payer = group.members.find(m => m.id === paidBy);
		if (!payer) {
			return res.status(400).json({ error: 'Valid paidBy memberId is required' });
		}
		const splitIds = Array.isArray(splitBetween) ? splitBetween : [];
		const validSplit = splitIds.filter(id => group.members.some(m => m.id === id));
		if (validSplit.length === 0) {
			return res.status(400).json({ error: 'splitBetween must include at least one valid memberId' });
		}
		const expense = {
			id: generateId('e_'),
			description: description.trim(),
			amount: Math.round(amt * 100) / 100,
			paidBy: payer.id,
			splitBetween: validSplit,
			createdAt: new Date().toISOString()
		};
		group.expenses.push(expense);
		const snapshot = groupSnapshot(group);
		io.to(`group:${group.id}`).emit('group_updated', snapshot);
		res.status(201).json({ expense, group: snapshot });
	} catch (err) {
		next(err);
	}
});

// Socket.IO
io.on('connection', (socket) => {
	socket.on('join_group', ({ groupId }) => {
		try {
			const group = ensureGroup(groupId);
			socket.join(`group:${groupId}`);
			socket.emit('group_updated', groupSnapshot(group));
		} catch {
			socket.emit('error_message', { error: 'Group not found' });
		}
	});
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	const status = err.status || 500;
	res.status(status).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});


