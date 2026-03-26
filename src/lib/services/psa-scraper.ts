/**
 * PSA Population Report Scraper
 *
 * Scrapes publicly available PSA population reports and cert verification
 * pages from psacard.com. Uses fetch with browser-like headers and
 * regex-based HTML parsing — no DOM parser dependency required.
 */

const PSA_BASE = 'https://www.psacard.com';

const HEADERS: HeadersInit = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9',
	'Cache-Control': 'no-cache'
};

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PSAPopData {
	cardName: string;
	setName: string;
	year: string;
	grades: Record<string, number>; // { "1": 5, "2": 12, ..., "10": 47 }
	totalGraded: number;
	gemRate: number; // percentage that got PSA 10
	highestGrade: number;
	psaPopUrl: string;
}

export interface PSACertData {
	certNumber: string;
	grade: number;
	cardName: string;
	year: string;
	setName: string;
	cardNumber: string;
	imageUrl: string | null;
	verified: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Small pause to avoid hammering PSA's servers. */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch a page with browser-like headers, returning the HTML body. */
async function fetchPage(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, { headers: HEADERS });
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

/** Strip HTML tags from a string and collapse whitespace. */
function stripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#?\w+;/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// ---------------------------------------------------------------------------
// searchPSAPop
// ---------------------------------------------------------------------------

/**
 * Search PSA's population report for a Pokemon card and extract grade
 * distribution data.
 *
 * Strategy:
 *  1. Hit the PSA pop search endpoint with the card name (and optional set).
 *  2. Parse the results page for a matching row / link.
 *  3. Follow the detail link and extract the grade distribution table.
 *  4. Compute totals and gem rate.
 */
export async function searchPSAPop(
	cardName: string,
	setName?: string
): Promise<PSAPopData | null> {
	try {
		const query = setName ? `${cardName} ${setName}` : cardName;
		const searchUrl = `${PSA_BASE}/pop?search=${encodeURIComponent(query)}`;

		const searchHtml = await fetchPage(searchUrl);
		if (!searchHtml) return null;

		// ------------------------------------------------------------------
		// Attempt to find a detail link on the search results page.
		// PSA search results typically render rows with links like
		// /pop/tcg-cards/pokemon/<set-slug>/<year>/<card-slug>
		// ------------------------------------------------------------------
		const detailLinkRegex =
			/href="(\/pop\/tcg-cards\/pokemon\/[^"]+)"/gi;
		const detailMatches = [...searchHtml.matchAll(detailLinkRegex)];

		let popPageHtml: string | null = null;
		let popUrl: string = searchUrl;

		if (detailMatches.length > 0) {
			// Pick the first matching detail link
			const detailPath = detailMatches[0][1];
			popUrl = `${PSA_BASE}${detailPath}`;
			await delay(500);
			popPageHtml = await fetchPage(popUrl);
		}

		// If we didn't find a detail page, try parsing the search page itself
		// (sometimes PSA renders the pop table inline).
		const html = popPageHtml ?? searchHtml;

		// ------------------------------------------------------------------
		// Extract grade distribution from the pop report table.
		// PSA tables generally have header cells for grade numbers and
		// corresponding data cells with population counts.
		// ------------------------------------------------------------------
		const grades: Record<string, number> = {};
		let totalGraded = 0;

		// Pattern 1: Look for a table with grade columns (1 through 10)
		// The header row often contains: Auth | 1 | 1.5 | 2 | ... | 10
		// Try to find rows with grade counts.
		const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
		const tables = [...html.matchAll(tableRegex)];

		let gradeTableFound = false;

		for (const tableMatch of tables) {
			const table = tableMatch[0];

			// Check if this table has grade-like headers (numbers 1-10)
			if (!/>\s*10\s*</.test(table)) continue;

			// Extract header cells to determine column positions
			const headerRowMatch = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/i);
			if (!headerRowMatch) continue;

			const headerCells = [...headerRowMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)];
			const gradeColumns: { index: number; grade: string }[] = [];

			headerCells.forEach((cell, idx) => {
				const text = stripHtml(cell[1]).trim();
				// Match whole and half grades: 1, 1.5, 2, ..., 10
				if (/^(10|[1-9](\.5)?)$/.test(text) || text === 'Auth') {
					gradeColumns.push({ index: idx, grade: text });
				}
			});

			if (gradeColumns.length === 0) continue;

			// Now extract data rows (skip the header row)
			const dataRows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

			// Use the first data row after the header (or the row matching our card)
			for (let r = 1; r < dataRows.length; r++) {
				const cells = [...dataRows[r][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
				if (cells.length < gradeColumns.length) continue;

				for (const col of gradeColumns) {
					if (col.index < cells.length) {
						const val = parseInt(stripHtml(cells[col.index][1]).replace(/,/g, ''), 10);
						if (!isNaN(val)) {
							grades[col.grade] = (grades[col.grade] ?? 0) + val;
						}
					}
				}

				if (Object.keys(grades).length > 0) {
					gradeTableFound = true;
					break;
				}
			}

			if (gradeTableFound) break;
		}

		// Pattern 2: If no table was found, try JSON-LD or inline data
		if (!gradeTableFound) {
			// Try to extract grade data from script tags or JSON embedded in page
			const jsonDataMatch = html.match(
				/(?:popData|gradeData|populationData)\s*[:=]\s*(\{[\s\S]*?\})\s*[;,]/i
			);
			if (jsonDataMatch) {
				try {
					const data = JSON.parse(jsonDataMatch[1]);
					for (const [key, value] of Object.entries(data)) {
						if (/^(10|[1-9](\.5)?)$/.test(key) && typeof value === 'number') {
							grades[key] = value;
						}
					}
				} catch {
					// JSON parse failed — continue
				}
			}

			// Pattern 3: Look for individual grade count elements
			// e.g. <span class="grade-10">47</span>
			const gradeSpanRegex =
				/(?:grade|psa)[_-]?(10|[1-9](?:\.5)?)[^>]*>\s*(\d[\d,]*)/gi;
			for (const m of html.matchAll(gradeSpanRegex)) {
				const grade = m[1];
				const count = parseInt(m[2].replace(/,/g, ''), 10);
				if (!isNaN(count)) {
					grades[grade] = (grades[grade] ?? 0) + count;
				}
			}
		}

		// If we still have no grade data, try to extract whatever we can from
		// generic table cells as a last resort — look for a row that contains
		// ten consecutive numeric cells.
		if (Object.keys(grades).length === 0) {
			const allRows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
			for (const row of allRows) {
				const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
				const numericCells = cells
					.map((c) => parseInt(stripHtml(c[1]).replace(/,/g, ''), 10))
					.filter((n) => !isNaN(n));

				if (numericCells.length >= 10) {
					// Assume last 10 numeric cells correspond to grades 1-10
					const start = numericCells.length - 10;
					for (let g = 1; g <= 10; g++) {
						grades[String(g)] = numericCells[start + g - 1];
					}
					break;
				}
			}
		}

		// Compute totals
		for (const count of Object.values(grades)) {
			totalGraded += count;
		}

		if (totalGraded === 0) return null;

		const psa10 = grades['10'] ?? 0;
		const gemRate = totalGraded > 0 ? Math.round((psa10 / totalGraded) * 10000) / 100 : 0;

		const highestGrade = Object.entries(grades)
			.filter(([, v]) => v > 0)
			.map(([k]) => parseFloat(k))
			.filter((n) => !isNaN(n))
			.sort((a, b) => b - a)[0] ?? 0;

		// Extract card name / set / year from the page
		const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const titleText = titleMatch ? stripHtml(titleMatch[1]) : '';

		const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
		const headingText = h1Match ? stripHtml(h1Match[1]) : '';

		// Try to parse year from title or heading (4-digit year)
		const yearMatch = (headingText || titleText).match(/\b(19|20)\d{2}\b/);
		const year = yearMatch ? yearMatch[0] : '';

		return {
			cardName: headingText || cardName,
			setName: setName ?? '',
			year,
			grades,
			totalGraded,
			gemRate,
			highestGrade,
			psaPopUrl: popUrl
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// lookupPSACert
// ---------------------------------------------------------------------------

/**
 * Look up a PSA certification number and extract grade, card details, and
 * front image from the cert verification page.
 */
export async function lookupPSACert(certNumber: string): Promise<PSACertData | null> {
	try {
		// Sanitise — cert numbers should be numeric
		const sanitised = certNumber.replace(/\D/g, '');
		if (!sanitised) return null;

		const certUrl = `${PSA_BASE}/cert/${sanitised}`;
		const html = await fetchPage(certUrl);
		if (!html) return null;

		// A valid cert page will contain the cert number somewhere
		if (!html.includes(sanitised)) return null;

		// ------------------------------------------------------------------
		// Extract grade
		// PSA cert pages show the grade prominently, often in a large heading
		// or a structured data block.
		// ------------------------------------------------------------------
		let grade = 0;

		// Pattern: "Grade: <strong>10</strong>" or similar
		const gradeMatch =
			html.match(/(?:grade|Grade)\s*[:\-]?\s*<[^>]*>\s*(10|[1-9](?:\.5)?)\s*</) ??
			html.match(/(?:grade|Grade)\s*[:\-]?\s*(10|[1-9](?:\.5)?)/) ??
			html.match(/class="[^"]*grade[^"]*"[^>]*>\s*(10|[1-9](?:\.5)?)\s*</) ??
			html.match(/"grade"\s*:\s*"?(10|[1-9](?:\.5)?)"?/);

		if (gradeMatch) {
			grade = parseFloat(gradeMatch[1]);
		}

		// ------------------------------------------------------------------
		// Extract card details
		// ------------------------------------------------------------------
		const descMatch =
			html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
			html.match(/class="[^"]*cert-title[^"]*"[^>]*>([\s\S]*?)</i);
		const description = descMatch ? stripHtml(descMatch[1]) : '';

		// Year
		const yearMatch = description.match(/\b(19|20)\d{2}\b/) ?? html.match(/"year"\s*:\s*"?((?:19|20)\d{2})"?/);
		const year = yearMatch ? yearMatch[1] ?? yearMatch[0] : '';

		// Card number (e.g. "#4", "No. 6", "004/102")
		const cardNumMatch =
			description.match(/#(\d+[A-Za-z]?)/) ??
			html.match(/(?:Card\s*(?:No\.?|Number|#)\s*[:\-]?\s*)(\d+[A-Za-z]?\/?[\d]*)/i);
		const cardNumber = cardNumMatch ? cardNumMatch[1] : '';

		// Set name — try structured data or a labelled field
		const setMatch =
			html.match(/(?:Set|Brand)\s*[:\-]\s*<[^>]*>\s*([^<]+)/i) ??
			html.match(/"setName"\s*:\s*"([^"]+)"/) ??
			html.match(/"set"\s*:\s*"([^"]+)"/);
		const extractedSetName = setMatch ? stripHtml(setMatch[1]) : '';

		// Card name — strip year and set from description
		let extractedCardName = description
			.replace(/\b(19|20)\d{2}\b/, '')
			.replace(extractedSetName, '')
			.replace(/#\d+[A-Za-z]?\/?[\d]*/g, '')
			.replace(/PSA\s*\d+/i, '')
			.replace(/\s+/g, ' ')
			.trim();
		if (!extractedCardName) extractedCardName = description;

		// ------------------------------------------------------------------
		// Extract image
		// ------------------------------------------------------------------
		const imgMatch =
			html.match(/class="[^"]*cert-image[^"]*"[^>]*src="([^"]+)"/i) ??
			html.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*cert[^"]*"/i) ??
			html.match(/<img[^>]*src="(https:\/\/[^"]*psacard[^"]*\.(jpg|png|webp)[^"]*)"/i) ??
			html.match(/<img[^>]*src="([^"]+)"[^>]*alt="[^"]*cert[^"]*"/i);
		const imageUrl = imgMatch ? imgMatch[1] : null;

		// ------------------------------------------------------------------
		// Verification — if the page contains clear "not found" signals, mark
		// as unverified.
		// ------------------------------------------------------------------
		const notFound =
			/cert(?:ification)?\s*(?:number\s*)?not\s*found/i.test(html) ||
			/no\s*results?\s*found/i.test(html) ||
			/invalid\s*cert/i.test(html);

		return {
			certNumber: sanitised,
			grade,
			cardName: extractedCardName,
			year,
			setName: extractedSetName,
			cardNumber,
			imageUrl,
			verified: !notFound && grade > 0
		};
	} catch {
		return null;
	}
}
