import { describe, expect, it } from 'vitest';
import {
	gateDiscoverySignals,
	hasAnyDiscoverySignal,
	type RawDiscoveryRow
} from '../discovery-signals';

const base: RawDiscoveryRow = {
	score_value: null,
	score_scarcity: null,
	psa_gem_rate: null,
	psa_pop_total: null,
	psa10_delta: null,
	psa10_multiple: null,
	ranking_confidence: null
};

describe('gateDiscoverySignals — honesty doctrine', () => {
	it('surfaces modeled ranks only at high/medium confidence', () => {
		expect(
			gateDiscoverySignals({ ...base, score_value: 69, ranking_confidence: 'high' })
				.value_rank
		).toBe(69);
		expect(
			gateDiscoverySignals({ ...base, score_value: 69, ranking_confidence: 'medium' })
				.value_rank
		).toBe(69);
	});

	it('suppresses a real-but-low-confidence score (the sv4-198 case)', () => {
		const d = gateDiscoverySignals({
			...base,
			score_value: 69,
			score_scarcity: 80,
			ranking_confidence: 'low'
		});
		expect(d.value_rank).toBeNull();
		expect(d.scarcity_rank).toBeNull();
	});

	it('null confidence also suppresses ranks', () => {
		expect(gateDiscoverySignals({ ...base, score_value: 50 }).value_rank).toBeNull();
	});

	it('gem rate needs a real PSA pop behind it', () => {
		expect(
			gateDiscoverySignals({ ...base, psa_gem_rate: 39.97, psa_pop_total: 2317 }).gem_rate
		).toBe(39.97);
		expect(
			gateDiscoverySignals({ ...base, psa_gem_rate: 39.97, psa_pop_total: 0 }).gem_rate
		).toBeNull();
		expect(
			gateDiscoverySignals({ ...base, psa_gem_rate: 39.97, psa_pop_total: null }).gem_rate
		).toBeNull();
	});

	it('only a positive psa10 delta surfaces, and the multiple rides with it', () => {
		const ok = gateDiscoverySignals({
			...base,
			psa10_delta: 86.97,
			psa10_multiple: 7.2
		});
		expect(ok.psa10_delta).toBe(86.97);
		expect(ok.psa10_multiple).toBe(7.2);

		const neg = gateDiscoverySignals({
			...base,
			psa10_delta: -5,
			psa10_multiple: 0.9
		});
		expect(neg.psa10_delta).toBeNull();
		expect(neg.psa10_multiple).toBeNull();
	});

	it('hasAnyDiscoverySignal reflects renderability', () => {
		expect(hasAnyDiscoverySignal(gateDiscoverySignals(base))).toBe(false);
		expect(
			hasAnyDiscoverySignal(
				gateDiscoverySignals({ ...base, psa10_delta: 10 })
			)
		).toBe(true);
	});
});
