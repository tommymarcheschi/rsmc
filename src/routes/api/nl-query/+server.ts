/**
 * POST /api/nl-query
 *
 * Natural-language → hunt-mode DSL translator, powered by Claude Haiku 4.5.
 *
 * User posts { prompt: "pre-2007 holo with pop under 300" } and the endpoint
 * returns { dsl, params, errors, usage } where params is ready to drop into
 * /browse?mode=hunt&... Anthropic handles the interpretation; our existing
 * parseHuntDSL() validates the output — so even if the model hallucinates
 * a bogus token, the parser catches it and surfaces it as an error.
 *
 * Why Haiku, not Sonnet/Opus: the task is a tight regex-ish translation,
 * not reasoning. Haiku 4.5 is fast (sub-second) and cheap ($1/M input).
 * Prompt caching would help but the system prompt (~500 tokens) is below
 * Haiku's 4096-token minimum cacheable prefix — not worth padding.
 */
import Anthropic from '@anthropic-ai/sdk';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { parseHuntDSL } from '$services/hunt-dsl';
import type { RequestHandler } from './$types';

// The DSL grammar, written as an instruction set. Kept tight — every
// token the parser knows about, plus enough examples to demonstrate
// edge cases (ranges, quoted multi-word values, natural-language
// number words like "under 100" → "<100"). The LAST line is the
// critical guardrail: the model has a strong tendency to add markdown
// or preamble if you don't explicitly forbid it.
const SYSTEM_PROMPT = `You translate natural-language Pokemon card searches into a compact DSL.

FIELDS (always include a colon):
- pop:N — max combined PSA+CGC population (e.g. pop:<100)
- year:N or year:A-B — release year range (e.g. year:<2017, year:2010-2016)
- price:N — raw NM price in USD (e.g. price:10-50, price:<20)
- raw:N — alias for price:
- rarity:WORD — partial rarity match (e.g. rarity:holo, rarity:ultra). Quote multi-word values: rarity:"Rare Ultra"
- set:ID — exact set id (e.g. set:base1, set:me3, set:me2pt5)

OPERATORS inside a field value: <N, >N, <=N, >=N, A-B, or bare N for equality.

FLAGS (no colon, bare keyword):
- psa10 — requires a PSA 10 comp exists on the card
- holo — holofoil printing
- reverse — reverse holo printing

BARE WORDS (anything not matching above) become the card name search.

EXAMPLES:
Input: "pre-2017 holo cards with pop under 100"
Output: year:<2017 holo pop:<100

Input: "Charizard cards under $50"
Output: charizard price:<50

Input: "vintage rare holos with PSA 10 data"
Output: year:<2003 rarity:holo psa10

Input: "Ascended Heroes chase cards over $100"
Output: set:me2pt5 price:>100

Input: "modern ultra rares between 2019 and 2023"
Output: rarity:ultra year:2019-2023

Input: "low pop reverse holos from 2015"
Output: year:2015 reverse pop:<100

RESPOND WITH ONLY THE DSL STRING. NO PREAMBLE. NO MARKDOWN. NO EXPLANATION.`;

const apiKey = env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export const POST: RequestHandler = async ({ request }) => {
	if (!client) {
		throw error(
			503,
			'Natural-language search is not configured. Add ANTHROPIC_API_KEY to the server environment.'
		);
	}

	let body: { prompt?: string } = {};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Expected JSON body');
	}
	const prompt = (body.prompt ?? '').trim();
	if (!prompt) throw error(400, 'prompt is required');
	if (prompt.length > 500) throw error(400, 'prompt too long (max 500 chars)');

	const response = await client.messages.create({
		model: 'claude-haiku-4-5',
		max_tokens: 200,
		system: SYSTEM_PROMPT,
		messages: [{ role: 'user', content: prompt }]
	});

	// Pull the text block out of the response. Haiku returns a single text
	// block for this task; defensive code in case the model ever returns
	// multiple (we concatenate then parse).
	const dsl = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join(' ')
		.trim();

	const parsed = parseHuntDSL(dsl);

	return json({
		dsl,
		params: parsed.params,
		errors: parsed.errors,
		usage: {
			input_tokens: response.usage.input_tokens,
			output_tokens: response.usage.output_tokens
		}
	});
};
