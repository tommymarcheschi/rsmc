import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		// Git worktrees live under .claude/worktrees and carry their own
		// copies of the test files but no resolvable tsconfig — without this
		// vitest globs into them and fails on a phantom duplicate suite.
		exclude: [...configDefaults.exclude, '.claude/**']
	}
});
