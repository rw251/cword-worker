import { update } from './cword';

export default {
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async scheduled(event, env, ctx) {
		await update(env);
	},

	async fetch(request, env) {
		// await update(env);
		// return new Response('{}', {
		// 	headers: {
		// 		'content-type': 'application/json;charset=UTF-8',
		// 	},
		// });
	},
};
