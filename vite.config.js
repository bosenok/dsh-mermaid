import { defineConfig } from "vite";

// The client half ships as one self-contained IIFE (mermaid included), which
// the harness module loader evaluates after concatenating the wrapper.
export default defineConfig({
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		lib: {
			entry: "src/main.js",
			name: "DshMermaidRuntime",
			formats: ["iife"],
			fileName: () => "runtime.js",
		},
	},
});
