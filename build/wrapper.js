window.__ModuleLoader__.load({
	id: "dsh-mermaid",
	factory: () => {
		var module = { exports: {} };
		var exports = module.exports;

		/** Start the DOM watcher for markdown code blocks; stop it on dispose. */
		function apply(ctx) {
			const runtime = window.DshMermaid;
			if (runtime == null) {
				console.warn("[dsh-mermaid] runtime is missing (the bundle did not initialize)");
				return;
			}
			ctx.effect(() => {
				runtime.start();
				return () => runtime.stop();
			}, "dsh-mermaid: diagram watcher");
		}

		exports.apply = apply;
		exports.inject = [];
		return module.exports;
	},
});
