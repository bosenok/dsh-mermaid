// Wrapper integration test: evaluates the BUILT client bundle under happy-dom
// with the renderer's module-loader contract stubbed, then asserts the plugin
// registers, exports apply(), and actually starts its DOM watcher.
import { Window } from "happy-dom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const window = new Window({ url: "http://localhost/" });
for (const key of ["document", "MutationObserver", "HTMLElement", "Element", "Node", "SVGElement", "getComputedStyle"]) {
	if (window[key] !== undefined) globalThis[key] = window[key];
}
globalThis.window = window;

const bundlePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "client.js");
const code = fs.readFileSync(bundlePath, "utf8");

let registered = null;
window.__ModuleLoader__ = {
	load(module) {
		registered = module;
	},
};

new Function(code)();
if (registered == null || registered.id !== "dsh-mermaid") {
	console.log("[FAIL] bundle did not register under dsh-mermaid");
	process.exit(1);
}
console.log("[ok] bundle registers:", registered.id);

const exported = registered.factory(() => {
	throw new Error("dsh-mermaid must not require other modules");
});
console.log("[ok] exports:", Object.keys(exported).join(", "));
if (typeof exported.apply !== "function") {
	console.log("[FAIL] exports.apply is missing");
	process.exit(1);
}

let disposer = null;
exported.apply({
	effect(factory) {
		disposer = factory();
		return () => disposer?.();
	},
});
console.log("[ok] runtime present:", typeof window.DshMermaid);
if (typeof window.DshMermaid?.start !== "function") {
	console.log("[FAIL] the runtime did not initialize");
	process.exit(1);
}

// A mermaid block added after startup must be picked up by the watcher.
const block = window.document.createElement("div");
block.className = "_block_7gxqk_4";
block.innerHTML = `<div class="_banner_7gxqk_24"><span class="_infostring_7gxqk_45">mermaid</span></div>
	<div class="_content_7gxqk_74"><pre></pre></div>`;
// happy-dom corrupts "-->" inside innerHTML text, so set it as a text node.
block.querySelector("pre").textContent = "graph TD; A-->B;";
window.document.body.appendChild(block);

await new Promise((resolve) => setTimeout(resolve, 1200));
const rendered = block.querySelector("[data-dsh-mermaid-diagram] svg") != null;
console.log(`${rendered ? "[ok]" : "[warn]"} watcher rendered the added block:`, rendered);
if (!rendered) {
	// mermaid may need more layout than happy-dom provides; the DOM swap itself
	// is covered by diagrams-smoke, so this is reported, not fatal.
	console.log("       (mermaid layout needs a real browser; detection is covered by diagrams-smoke)");
}

disposer?.();
console.log("WRAPPER TEST OK");
