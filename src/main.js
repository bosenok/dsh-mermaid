// Client runtime for dsh-mermaid: initializes the mermaid library, watches the
// document for markdown code blocks that arrive later (navigation, streaming
// chat, re-render), and swaps qualifying blocks for rendered diagrams.
import mermaid from "mermaid";
import { findDiagramBlocks, forgetRendered, isDarkTheme, renderDiagram } from "./diagrams.js";

/** Quiescence window before a sweep: streaming markdown settles between chunks. */
const DEBOUNCE_MS = 350;

const STYLE_ID = "dsh-mermaid-style";
const STYLE = `
[data-dsh-mermaid-diagram]{position:relative;margin:12px 0;border-radius:var(--dsw-radius-lg,10px);
  background:var(--dsw-alias-markdown-code-block,#1f1f1f);overflow:hidden}
[data-dsh-mermaid-diagram][data-expanded]{position:fixed;inset:0;z-index:120;margin:0;border-radius:0}
[data-dsh-mermaid-diagram]:fullscreen{background:var(--dsw-alias-bg-base,#1b1b1b);margin:0;border-radius:0;overflow:auto}
[data-dsh-mermaid-diagram]:fullscreen .dsh-mermaid-viewport{height:100%}
.dsh-mermaid-viewport{height:clamp(220px,42vh,520px);overflow:hidden;cursor:grab;touch-action:none;
  background:var(--dsw-alias-markdown-code-block,#1f1f1f)}
[data-dsh-mermaid-diagram][data-expanded] .dsh-mermaid-viewport{height:100%}
.dsh-mermaid-viewport[data-panning]{cursor:grabbing}
.dsh-mermaid-canvas{transform-origin:0 0;will-change:transform;display:inline-block;padding:8px}
.dsh-mermaid-canvas svg{display:block;max-width:none!important;height:auto}
.dsh-mermaid-toolbar{position:absolute;top:8px;right:8px;z-index:2;display:flex;align-items:center;gap:4px;
  padding:3px 6px;border-radius:999px;background:var(--dsw-alias-bg-base,#1b1b1b);border:1px solid var(--dsw-alias-border-l3,#333);
  box-shadow:0 2px 10px rgb(0 0 0 / 35%)}
.dsh-mermaid-button{background:transparent;border:none;color:var(--dsw-alias-label-secondary,#bbb);cursor:pointer;
  font:inherit;font-size:13px;line-height:1;padding:3px 7px;border-radius:6px}
.dsh-mermaid-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgb(255 255 255 / 8%));color:var(--dsw-alias-label-primary,#eee)}
.dsh-mermaid-zoom{min-width:44px;text-align:center;font-size:11px;color:var(--dsw-alias-label-secondary,#bbb);
  font-variant-numeric:tabular-nums}
.dsh-mermaid-error{margin:6px 0 0;padding:6px 10px;border-radius:8px;font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-warning,#e5c07b);background:color-mix(in srgb,var(--dsw-alias-label-warning,#e5c07b) 12%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-warning,#e5c07b) 30%,transparent)}
`;

let observer = null;
let themeObserver = null;
let timer = null;
let sweeping = false;
let theme = null;

/** Apply the current color scheme to mermaid; returns true when it changed. */
function syncTheme() {
	const next = isDarkTheme(document) ? "dark" : "default";
	if (next === theme) return false;
	theme = next;
	mermaid.initialize({
		startOnLoad: false,
		theme: next,
		securityLevel: "strict",
		fontFamily: "inherit",
	});
	return true;
}

/** Render every qualifying block currently in the document. */
export async function sweep() {
	if (sweeping) return;
	sweeping = true;
	try {
		for (const descriptor of findDiagramBlocks(document.body)) {
			// The document may have changed while an earlier diagram rendered.
			if (descriptor.block.isConnected === false) continue;
			await renderDiagram(descriptor, mermaid, document);
		}
	} catch (error) {
		console.warn("[dsh-mermaid] sweep failed:", error?.message ?? error);
	} finally {
		sweeping = false;
	}
}

function schedule() {
	clearTimeout(timer);
	timer = setTimeout(() => void sweep(), DEBOUNCE_MS);
}

function installStyle() {
	if (document.getElementById(STYLE_ID) != null) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = STYLE;
	document.head.appendChild(style);
}

window.DshMermaid = {
	start() {
		if (observer != null) return;
		installStyle();
		syncTheme();
		observer = new MutationObserver(schedule);
		observer.observe(document.body, { childList: true, subtree: true, characterData: true });
		// Theme switches re-render every diagram with the other palette.
		themeObserver = new MutationObserver(() => {
			if (syncTheme()) {
				forgetRendered(document.body);
				schedule();
			}
		});
		themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-ds-dark-theme", "data-theme"] });
		schedule();
	},
	stop() {
		observer?.disconnect();
		themeObserver?.disconnect();
		observer = null;
		themeObserver = null;
		clearTimeout(timer);
	},
	sweep,
};
