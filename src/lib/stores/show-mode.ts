import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'trove:show-mode';
const DOM_ATTR = 'showMode';

function readInitial(): boolean {
	if (!browser) return false;
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

const store = writable<boolean>(readInitial());

if (browser) {
	store.subscribe((value) => {
		try {
			localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
		} catch {
			// localStorage can throw in private mode / quota; show-mode UX still works in-session
		}
		document.documentElement.dataset[DOM_ATTR] = value ? 'on' : 'off';
	});
}

export const showMode = {
	subscribe: store.subscribe,
	toggle: () => store.update((v) => !v),
	set: (v: boolean) => store.set(v)
};
