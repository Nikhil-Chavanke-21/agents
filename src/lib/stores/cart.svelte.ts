export type CartItem = {
	id: string;
	name: string;
	image: string;
	price: number;
	quantity: number;
};

export type BillLine = {
	label: string;
	value: string;
};

export type Address = {
	id: string;
	label: string;
	address: string;
};

let items = $state<CartItem[]>([]);
let total = $state(0);
let billLines = $state<BillLine[]>([]);
let connected = $state(false);
let loading = $state(false);
let addresses = $state<Address[]>([]);
let selectedAddressId = $state<string | null>(null);

async function tool(name: string, args: Record<string, unknown> = {}) {
	const res = await fetch('/api/swiggy/tool', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, args })
	});
	return res.json();
}

export const cart = {
	get items() {
		return items;
	},
	get total() {
		return total;
	},
	get billLines() {
		return billLines;
	},
	get connected() {
		return connected;
	},
	get loading() {
		return loading;
	},
	get addresses() {
		return addresses;
	},
	get selectedAddressId() {
		return selectedAddressId;
	},
	get hasAddress() {
		return !!selectedAddressId;
	},

	async checkConnection() {
		try {
			const res = await fetch('/api/swiggy/connect');
			const data = await res.json();
			connected = data.connected;
			if (connected) await this.fetchAddresses();
		} catch {
			connected = false;
		}
	},

	async connect() {
		const res = await fetch('/api/swiggy/connect');
		const data = await res.json();
		if (data.connected) {
			connected = true;
			await this.fetchAddresses();
			return;
		}
		if (data.authUrl) {
			window.location.href = data.authUrl;
		}
	},

	async fetchAddresses() {
		try {
			const res = await fetch('/api/swiggy/addresses');
			if (!res.ok) return;
			const data = await res.json();
			const raw = data.addresses?.data?.addresses ?? data.addresses;
			if (Array.isArray(raw)) {
				addresses = raw.map((a: Record<string, unknown>) => ({
					id: String(a.id ?? ''),
					label: String(a.addressLine ?? '').split(':')[0] || 'Address',
					address:
						String(a.addressLine ?? '')
							.split(': ')
							.slice(1)
							.join(': ') || ''
				}));
			}
			if (data.selected) {
				selectedAddressId = data.selected;
			}
		} catch (err) {
			console.error('[Cart] Failed to fetch addresses:', err);
		}
	},

	async selectAddress(id: string) {
		const res = await fetch('/api/swiggy/addresses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ addressId: id })
		});
		if (res.ok) {
			selectedAddressId = id;
		}
	},

	async refreshCart() {
		try {
			const data = await tool('get_cart');
			if (!data.ok) return;
			console.log('[Cart] get_cart:', data.result);

			const r = data.result as Record<string, unknown>;
			const d = r?.data as Record<string, unknown> | undefined;
			const rawItems = (d?.items ?? (d?.cart as Record<string, unknown>)?.items ?? r?.items) as
				| unknown[]
				| undefined;

			if (Array.isArray(rawItems) && rawItems.length > 0) {
				items = rawItems.map((item: Record<string, unknown>) => ({
					id: String(item.spinId ?? item.id ?? ''),
					name: String(item.itemName ?? item.displayName ?? item.name ?? ''),
					image: String(item.imageUrl ?? item.image ?? ''),
					price: Number(
						item.offerPrice ??
							(item.price as Record<string, unknown>)?.offerPrice ??
							item.mrp ??
							item.price ??
							0
					),
					quantity: Number(item.quantity ?? 1)
				}));
				total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
			}

			const cartTotal = d?.totalAmount ?? (d?.cart as Record<string, unknown>)?.totalAmount;
			if (typeof cartTotal === 'number') {
				total = cartTotal;
			} else if (typeof d?.cartTotalAmount === 'string') {
				const parsed = parseFloat(String(d.cartTotalAmount).replace(/[^\d.]/g, ''));
				if (!isNaN(parsed)) total = parsed;
			}

			const bill = d?.billBreakdown as Record<string, unknown> | undefined;
			if (bill) {
				const rawLines = bill.lineItems as Record<string, unknown>[] | undefined;
				if (Array.isArray(rawLines)) {
					billLines = rawLines.map((l) => ({
						label: String(l.title ?? l.label ?? l.name ?? ''),
						value: String(l.value ?? l.amount ?? l.price ?? '')
					}));
				}
				const toPay = bill.toPay as Record<string, unknown> | undefined;
				if (toPay) {
					const payVal = String(toPay.value ?? toPay.amount ?? d?.cartTotalAmount ?? '');
					const parsed = parseFloat(payVal.replace(/[^\d.]/g, ''));
					if (!isNaN(parsed)) total = parsed;
				}
			}
		} catch {
			/* ignore */
		}
	},

	async order(): Promise<string> {
		if (!selectedAddressId) return 'Select an address first';
		loading = true;
		try {
			const data = await tool('checkout', { addressId: selectedAddressId });
			if (!data.ok) {
				return data.error || 'Checkout failed';
			}
			const r = data.result as Record<string, unknown>;
			if (!r?.success) {
				const err = r?.error as Record<string, unknown> | undefined;
				return String(err?.message || 'Checkout failed');
			}
			items = [];
			total = 0;
			billLines = [];
			return String(r.message || 'Order placed!');
		} catch (e) {
			return `Failed: ${e}`;
		} finally {
			loading = false;
		}
	}
};
