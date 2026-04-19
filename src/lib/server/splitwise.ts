import { env } from '$env/dynamic/private';
import type OpenAI from 'openai';

const SPLITWISE_URL = 'https://secure.splitwise.com/api/v3.0/create_expense';
const GROUP_ID = '77216248';

const USERS = {
	nikhil: '22566194',
	krishna: '11284344',
	malav: '11074181',
	srushti: '47760726'
} as const;

export const SPLITWISE_TOOL: OpenAI.Chat.ChatCompletionTool = {
	type: 'function',
	function: {
		name: 'splitwise_create_expense',
		description:
			'Create a group expense on Splitwise to split costs among Nikhil, Krishna, Malav, and Srushti. Nikhil always pays the full amount. The sum of all *_owed values MUST equal cost.',
		parameters: {
			type: 'object',
			properties: {
				description: {
					type: 'string',
					description: 'What the expense is for (e.g. "Instamart Order")'
				},
				cost: { type: 'string', description: 'Total cost in INR (e.g. "542.00")' },
				nikhil_owed: { type: 'string', description: 'Amount Nikhil owes (INR)' },
				krishna_owed: { type: 'string', description: 'Amount Krishna owes (INR)' },
				malav_owed: { type: 'string', description: 'Amount Malav owes (INR)' },
				srushti_owed: { type: 'string', description: 'Amount Srushti owes (INR)' }
			},
			required: ['description', 'cost', 'nikhil_owed', 'krishna_owed', 'malav_owed', 'srushti_owed']
		}
	}
};

type ExpenseArgs = {
	description: string;
	cost: string;
	nikhil_owed: string;
	krishna_owed: string;
	malav_owed: string;
	srushti_owed: string;
};

export async function createExpense(args: ExpenseArgs): Promise<unknown> {
	const apiKey = env.SPLITWISE_API_KEY;
	if (!apiKey) throw new Error('SPLITWISE_API_KEY not set');

	const body = new URLSearchParams({
		cost: args.cost,
		currency_code: 'INR',
		group_id: GROUP_ID,
		description: args.description,
		users__0__user_id: USERS.nikhil,
		users__0__paid_share: args.cost,
		users__0__owed_share: args.nikhil_owed,
		users__1__user_id: USERS.krishna,
		users__1__paid_share: '0',
		users__1__owed_share: args.krishna_owed,
		users__2__user_id: USERS.malav,
		users__2__paid_share: '0',
		users__2__owed_share: args.malav_owed,
		users__3__user_id: USERS.srushti,
		users__3__paid_share: '0',
		users__3__owed_share: args.srushti_owed
	});

	console.log(`[Splitwise] Creating expense: ${args.description} ₹${args.cost}`);

	const res = await fetch(SPLITWISE_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body
	});

	const data = await res.json();

	if (!res.ok) {
		console.error('[Splitwise] Error:', data);
		throw new Error(`Splitwise API error ${res.status}: ${JSON.stringify(data)}`);
	}

	console.log('[Splitwise] Success:', JSON.stringify(data).slice(0, 300));
	return data;
}
