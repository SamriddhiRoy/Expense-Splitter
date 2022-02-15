import { useEffect, useMemo, useState } from 'react';
import './index.css';
import { addExpense, addMember, createGroup, getGroup, type Group, type Member } from './lib/api';
import { connectToGroup } from './lib/socket';

type JoinState = {
	groupIdInput: string;
	nameInput: string;
};

function App() {
	const [join, setJoin] = useState<JoinState>({ groupIdInput: '', nameInput: '' });
	const [currentGroupId, setCurrentGroupId] = useState<string>('');
	const [currentMember, setCurrentMember] = useState<Member | null>(null);
	const [group, setGroup] = useState<Group | null>(null);
	const [error, setError] = useState<string>('');

	// Expense form
	const [desc, setDesc] = useState('');
	const [amount, setAmount] = useState<string>('');
	const [paidBy, setPaidBy] = useState<string>('');
	const [splitBetween, setSplitBetween] = useState<Record<string, boolean>>({});
	const [newMembersInput, setNewMembersInput] = useState<string>('');

	useEffect(() => {
		if (!currentGroupId) return;
		const disconnect = connectToGroup(
			currentGroupId,
			(updated) => {
				setGroup(updated);
				if (!paidBy && updated.members.length > 0 && currentMember) {
					setPaidBy(currentMember.id);
				}
				// Default split between everyone
				const defaults: Record<string, boolean> = {};
				for (const m of updated.members) {
					defaults[m.id] = splitBetween[m.id] ?? true;
				}
				setSplitBetween(defaults);
			},
			(msg) => setError(msg)
		);
		return disconnect;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentGroupId]);

	const balancesList = useMemo(() => {
		if (!group) return [];
		return group.members.map((m) => ({
			member: m,
			amount: group.balances[m.id] ?? 0
		}));
	}, [group]);

	async function handleCreateGroup() {
		setError('');
		try {
			const { id, group: newGroup } = await createGroup('Group');
			setCurrentGroupId(id);
			setGroup(newGroup);
			// Auto add user if provided
			if (join.nameInput.trim()) {
				const { member, group: g2 } = await addMember(id, join.nameInput.trim());
				setCurrentMember(member);
				setGroup(g2);
			}
		} catch (e: any) {
			setError(e.message || 'Failed to create group');
		}
	}

	async function handleJoinGroup() {
		setError('');
		if (!join.groupIdInput.trim()) {
			setError('Enter a group id');
			return;
		}
		if (!join.nameInput.trim()) {
			setError('Enter your name');
			return;
		}
		try {
			// Ensure group exists
			await getGroup(join.groupIdInput.trim());
			const { member, group } = await addMember(join.groupIdInput.trim(), join.nameInput.trim());
			setCurrentGroupId(group.id);
			setCurrentMember(member);
			setGroup(group);
		} catch (e: any) {
			setError(e.message || 'Failed to join group');
		}
	}

	async function handleAddExpense() {
		if (!group || !currentGroupId) return;
		setError('');
		const selected = Object.entries(splitBetween)
			.filter(([, v]) => v)
			.map(([k]) => k);
		if (!desc.trim()) return setError('Add a description');
		const amt = Number(amount);
		if (!Number.isFinite(amt) || amt <= 0) return setError('Enter a positive amount');
		if (!paidBy) return setError('Select who paid');
		if (selected.length === 0) return setError('Pick at least one participant');
		try {
			const { group: updated } = await addExpense(currentGroupId, {
				description: desc.trim(),
				amount: amt,
				paidBy,
				splitBetween: selected
			});
			setGroup(updated);
			setDesc('');
			setAmount('');
		} catch (e: any) {
			setError(e.message || 'Failed to add expense');
		}
	}

	async function handleAddMembersBulk() {
		if (!currentGroupId) return;
		const raw = newMembersInput.trim();
		if (!raw) return;
		setError('');
		const names = raw
			.split(/[\n,]/g)
			.map((s) => s.trim())
			.filter(Boolean)
			.slice(0, 20); // safety cap
		if (names.length === 0) return;
		try {
			let latest = group;
			for (const name of names) {
				const { group: g2 } = await addMember(currentGroupId, name);
				latest = g2;
				setGroup(g2);
			}
			// Keep default split to include everyone
			if (latest) {
				const next: Record<string, boolean> = {};
				for (const m of latest.members) next[m.id] = true;
				setSplitBetween(next);
			}
			setNewMembersInput('');
		} catch (e: any) {
			setError(e.message || 'Failed to add members');
		}
	}

	if (!currentGroupId) {
		return (
			<div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 via-white to-pink-50">
				<div className="w-full max-w-xl bg-white shadow-lg rounded-xl p-6 md:p-8 space-y-5 border border-gray-100">
					<h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Real-Time Expense Splitter</h1>
					{error && <div className="text-red-600 text-sm">{error}</div>}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div className="space-y-2">
							<label className="text-sm font-medium">Your name</label>
							<input
								className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
								placeholder="e.g., Alex"
								value={join.nameInput}
								onChange={(e) => setJoin({ ...join, nameInput: e.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium">Group ID (to join)</label>
							<input
								className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
								placeholder="e.g., g_ab12cd"
								value={join.groupIdInput}
								onChange={(e) => setJoin({ ...join, groupIdInput: e.target.value })}
							/>
						</div>
					</div>
					<div className="flex gap-3">
						<button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
							onClick={handleCreateGroup}>
							Create Group
						</button>
						<button className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg transition"
							onClick={handleJoinGroup}>
							Join Group
						</button>
					</div>
					<p className="text-sm text-gray-600">
						Share the Group ID with others. Everyone sees updates instantly.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-full p-4 md:p-8 bg-gray-50">
			<div className="max-w-6xl mx-auto space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{group?.name || 'Group'}</h1>
						<p className="text-xs md:text-sm text-gray-600">ID: {currentGroupId}</p>
					</div>
					<div className="text-sm text-gray-700">
						You: <span className="font-medium">{currentMember?.name || 'Anonymous'}</span>
					</div>
				</div>

				{error && <div className="text-red-600 text-sm">{error}</div>}

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Members and balances */}
					<div className="bg-white rounded-xl shadow p-4 space-y-3 border border-gray-100">
						<h2 className="font-medium">Members</h2>
						<ul className="space-y-1">
							{group?.members.map((m) => (
								<li key={m.id} className="flex items-center justify-between text-sm">
									<span>{m.name}</span>
									<span
										className={
											(group?.balances[m.id] ?? 0) > 0 ? 'text-green-700' : (group?.balances[m.id] ?? 0) < 0 ? 'text-red-700' : 'text-gray-700'
										}
									>
										{(group?.balances[m.id] ?? 0).toFixed(2)}
									</span>
								</li>
							))}
						</ul>
						<div className="pt-2 space-y-2">
							<label className="text-sm text-gray-600">Add members (comma or newline separated)</label>
							<textarea
								className="w-full min-h-[72px] border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
								placeholder="e.g., Sam, Alex, Taylor"
								value={newMembersInput}
								onChange={(e) => setNewMembersInput(e.target.value)}
							/>
							<div className="flex justify-end">
								<button
									className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
									onClick={handleAddMembersBulk}
								>
									Add Members
								</button>
							</div>
						</div>
					</div>

					{/* Add expense */}
					<div className="bg-white rounded-xl shadow p-4 space-y-3 lg:col-span-2 border border-gray-100">
						<h2 className="font-medium">Add Expense</h2>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							<input
								className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
								placeholder="Description"
								value={desc}
								onChange={(e) => setDesc(e.target.value)}
							/>
							<input
								type="number"
								className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
								placeholder="Amount"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
							/>
							<div className="space-y-1">
								<label className="text-sm text-gray-600">Paid by</label>
								<select
									className="border rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
									value={paidBy}
									onChange={(e) => setPaidBy(e.target.value)}
								>
									<option value="">Select</option>
									{group?.members.map((m) => (
										<option key={m.id} value={m.id}>
											{m.name}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-1">
								<label className="text-sm text-gray-600">Split between</label>
								<div className="flex flex-wrap gap-3">
									{group?.members.map((m) => (
										<label key={m.id} className="inline-flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												checked={!!splitBetween[m.id]}
												onChange={(e) =>
													setSplitBetween((s) => ({ ...s, [m.id]: e.target.checked }))
												}
											/>
											<span>{m.name}</span>
										</label>
									))}
								</div>
							</div>
						</div>
						<div>
							<button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
								onClick={handleAddExpense}>
								Add
							</button>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="bg-white rounded-xl shadow p-4 space-y-3 border border-gray-100">
						<h2 className="font-medium">Expenses</h2>
						<ul className="divide-y">
							{group?.expenses.map((e) => {
								const payer = group.members.find((m) => m.id === e.paidBy)?.name ?? 'Unknown';
								return (
									<li key={e.id} className="py-2 text-sm flex items-center justify-between">
										<div>
											<div className="font-medium">{e.description}</div>
											<div className="text-gray-600">
												{payer} paid {e.amount.toFixed(2)} • split among {e.splitBetween.length}
											</div>
										</div>
										<div className="text-gray-500">{new Date(e.createdAt).toLocaleString()}</div>
									</li>
								);
							})}
						</ul>
					</div>

					<div className="bg-white rounded-xl shadow p-4 space-y-3 border border-gray-100">
						<h2 className="font-medium">Suggested Settlements</h2>
						{group?.settlements.length ? (
							<ul className="space-y-2 text-sm">
								{group.settlements.map((s, idx) => {
									const from = group.members.find((m) => m.id === s.from)?.name ?? s.from;
									const to = group.members.find((m) => m.id === s.to)?.name ?? s.to;
									return (
										<li key={idx} className="flex items-center justify-between">
											<span>
												<span className="font-medium">{from}</span> pays{' '}
												<span className="font-medium">{to}</span>
											</span>
											<span className="font-semibold">{s.amount.toFixed(2)}</span>
										</li>
									);
								})}
							</ul>
						) : (
							<div className="text-sm text-gray-600">All settled up 🎉</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export default App;
