import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Skin =
	| 'pokeball'
	| 'pikachu'
	| 'charizard'
	| 'gengar'
	| 'mewtwo'
	| 'bulbasaur'
	| 'umbreon'
	| 'sylveon';

export interface SkinInfo {
	id: Skin;
	name: string;
	pokemon: string;
	accent: string;
	secondary: string;
	bg: string;
	preview: string; // gradient for the swatch
}

export const SKINS: SkinInfo[] = [
	{ id: 'pokeball', name: 'Pokéball', pokemon: 'Classic', accent: '#ff5757', secondary: '#a78bfa', bg: '#12111a', preview: 'linear-gradient(135deg, #ff5757, #a78bfa)' },
	{ id: 'pikachu', name: 'Pikachu', pokemon: 'Electric', accent: '#facc15', secondary: '#fb923c', bg: '#141210', preview: 'linear-gradient(135deg, #facc15, #fb923c)' },
	{ id: 'charizard', name: 'Charizard', pokemon: 'Fire', accent: '#f97316', secondary: '#ef4444', bg: '#150f0c', preview: 'linear-gradient(135deg, #f97316, #ef4444)' },
	{ id: 'gengar', name: 'Gengar', pokemon: 'Ghost', accent: '#c084fc', secondary: '#e879f9', bg: '#0f0b15', preview: 'linear-gradient(135deg, #c084fc, #e879f9)' },
	{ id: 'mewtwo', name: 'Mewtwo', pokemon: 'Psychic', accent: '#818cf8', secondary: '#22d3ee', bg: '#0c0e18', preview: 'linear-gradient(135deg, #818cf8, #22d3ee)' },
	{ id: 'bulbasaur', name: 'Bulbasaur', pokemon: 'Grass', accent: '#4ade80', secondary: '#2dd4bf', bg: '#0c1210', preview: 'linear-gradient(135deg, #4ade80, #2dd4bf)' },
	{ id: 'umbreon', name: 'Umbreon', pokemon: 'Dark', accent: '#fbbf24', secondary: '#fcd34d', bg: '#0a0a0a', preview: 'linear-gradient(135deg, #fbbf24, #1a1a1a)' },
	{ id: 'sylveon', name: 'Sylveon', pokemon: 'Fairy', accent: '#f472b6', secondary: '#c4b5fd', bg: '#150f14', preview: 'linear-gradient(135deg, #f472b6, #c4b5fd)' }
];

function getInitialSkin(): Skin {
	if (browser) {
		const saved = localStorage.getItem('pokevault-skin');
		if (saved && SKINS.some((s) => s.id === saved)) {
			return saved as Skin;
		}
	}
	return 'pokeball';
}

function createThemeStore() {
	const { subscribe, set } = writable<Skin>(getInitialSkin());

	return {
		subscribe,
		set(skin: Skin) {
			set(skin);
			if (browser) {
				localStorage.setItem('pokevault-skin', skin);
				document.documentElement.setAttribute('data-skin', skin);
			}
		},
		init() {
			if (browser) {
				const skin = getInitialSkin();
				document.documentElement.setAttribute('data-skin', skin);
				set(skin);
			}
		}
	};
}

export const activeSkin = createThemeStore();
