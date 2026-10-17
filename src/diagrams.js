// Diagram rendering for the dsh-mermaid client half.
//
// The harness markdown renderer exposes no custom-code-block seam, so this
// module post-processes the rendered DOM instead: it finds fenced code that is
// a mermaid diagram, renders it with the mermaid library, and swaps the code
// view for the diagram.
//
// Detection is CONTENT-FIRST on purpose. The harness labels a block
// "Code block" whenever it does not resolve an info string, and the same block
// arrives through more than one component (markdown code block, code card), so
// the reliable signal is the diagram keyword on the first line of the code —
// with the language label used only as a secondary confirmation.
import { createDiagramViewer } from "./viewer.js";

/** Marks a block whose diagram is already in place. */
export const RENDERED_ATTR = "data-mermaid-rendered";
/** Remembers the source text of a failed render, to avoid retry loops. */
export const FAILED_ATTR = "data-mermaid-failed-source";
/** Marks a block currently being rendered. */
export const BUSY_ATTR = "data-mermaid-rendering";

/** Languages that always mean "diagram", whatever the body looks like. */
const DIAGRAM_LANGUAGES = new Set(["mermaid", "mmd"]);

/**
 * First-line signatures of the diagram types mermaid understands. The graph and
 * flowchart heads are matched STRICTLY (only the direction, then optionally
 * `;`/`%` syntax on the same line) so that prose and keyword enumerations —
 * "graph TD/TB/RL/LR · flowchart · …" — are not mistaken for diagrams.
 */
const DIAGRAM_PATTERNS = [
	/^(?:graph|flowchart)(?:\s+(?:TD|TB|BT|RL|LR))?(?:\s*[;%].*)?$/i,
	/^sequenceDiagram\b/,
	/^classDiagram(?:-v2)?\b/,
	/^stateDiagram(?:-v2)?\b/,
	/^erDiagram\b/,
	/^journey\b/,
	/^gantt\b/,
	/^pie(?:\s+(?:title|showData)\b.*)?\s*$/i,
	/^gitGraph\b/,
	/^mindmap\b/,
	/^timeline\b/,
	/^quadrantChart\b/,
	/^xychart(?:-beta)?\b/,
	/^block-beta\b/,
	/^sankey-beta\b/,
	/^packet-beta\b/,
	/^architecture-beta\b/,
	/^requirementDiagram\b/,
	/^C4(?:Context|Container|Component|Deployment|Dynamic)\b/,
	/^zenuml\b/,
];

/** Mermaid renders its own "Syntax error in text" artwork; never show that. */
const MERMAID_ERROR_MARKERS = ['aria-roledescription="error"', "Syntax error in text"];

/** True when the app is showing its dark theme. */
export function isDarkTheme(doc) {
	const root = doc?.documentElement;
	if (root == null) return true;
	if (root.hasAttribute("data-ds-dark-theme")) return true;
	if (root.querySelector("[data-ds-dark-theme]") != null) return true;
	return false;
}

/** The source text of one code element. */
export function sourceOf(pre) {
	return pre == null ? "" : String(pre.textContent ?? "");
}

/** The first non-empty line of a diagram source. */
export function firstLineOf(source) {
	for (const line of String(source ?? "").split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return "";
}

/** Whether a source looks like a mermaid diagram by its first line. */
export function looksLikeDiagram(source) {
	const first = firstLineOf(source);
	return first.length > 0 && DIAGRAM_PATTERNS.some((pattern) => pattern.test(first));
}

/**
 * Elements that may hold code. The harness renders a code block either as a
 * `<pre>` (markdown fenced block) or as structured line elements inside a card,
 * so candidates are matched by CSS-module NAME segment (`_content_`, `_body_`,
 * `_code_`, `_shiki_`), which survives rebuilds even though hashes change.
 */
const CANDIDATE_SELECTOR = ["pre", "code", '[class*="_content_"]', '[class*="_body_"]', '[class*="_code_"]', '[class*="_shiki_"]'].join(",");

/** Ancestors that carry the language label of a block. */
const LABEL_SCOPE_SELECTOR = '[class*="_infostring_"], [class*="_language_"]';

/**
 * The language label of a block, when the harness shows one. The label lives in
 * the card that owns the code, which may be the element itself or an ancestor.
 */
export function languageLabelOf(element, container) {
	let scope = container ?? element?.parentElement;
	if (scope?.querySelector == null) return "";
	// Prefer a label inside the block being inspected…
	const inside = scope.querySelector(LABEL_SCOPE_SELECTOR);
	if (inside != null) {
		const text = String(inside.textContent ?? "").trim().toLowerCase();
		if (text.length > 0) return text;
	}
	// …otherwise look in the owning card/block, which wraps the code.
	scope = scope.closest?.('[class*="_card_"], [class*="_block_"]');
	const owner = scope?.querySelector?.(LABEL_SCOPE_SELECTOR);
	return owner == null ? "" : String(owner.textContent ?? "").trim().toLowerCase();
}

/** True when the element can hold code. */
function isCandidate(element) {
	return element?.matches?.(CANDIDATE_SELECTOR) === true;
}

/**
 * The element that holds EXACTLY the diagram source and nothing else: start from
 * the deepest match and climb while the parent is still a code container whose
 * own text also starts with the diagram. This keeps the card header (with its
 * copy button) visible while the code view is replaced.
 */
function codeContainerOf(element) {
	let container = element;
	for (let depth = 0; depth < 4; depth += 1) {
		const parent = container.parentElement;
		if (parent == null || isCandidate(parent) === false) break;
		if (looksLikeDiagram(sourceOf(parent)) === false) break;
		container = parent;
	}
	return container;
}

/**
 * Every element inside `root` that holds a mermaid diagram but does not show one
 * yet. Blocks already rendered, currently rendering, or whose identical source
 * already failed are skipped.
 * @param root - subtree to scan (usually document.body).
 * @returns descriptors with the code element, the block that carries state, and the source text.
 */
export function findDiagramBlocks(root) {
	const found = [];
	const seen = new Set();
	if (root?.querySelectorAll == null) return found;
	for (const element of root.querySelectorAll(CANDIDATE_SELECTOR)) {
		if (element.closest("[data-dsh-mermaid-diagram]") != null) continue;
		// The source view lists the file verbatim and a diff lists +/- lines:
		// rendering a diagram there would hide the text the user asked to read.
		if (element.closest("[data-textpreview-plain]") != null) continue;
		if (element.closest('[class*="_diff_"]') != null) continue;
		const source = sourceOf(element);
		if (source.trim().length === 0) continue;
		const language = languageLabelOf(element, element);
		const isDiagram = DIAGRAM_LANGUAGES.has(language) || looksLikeDiagram(source);
		if (isDiagram === false) continue;

		const code = codeContainerOf(element);
		if (seen.has(code)) continue;
		seen.add(code);
		const block = code.closest?.('[class*="_card_"], [class*="_block_"]') ?? code;
		if (block.getAttribute?.(RENDERED_ATTR) === "1") continue;
		if (block.getAttribute?.(BUSY_ATTR) === "1") continue;
		if (block.getAttribute?.(FAILED_ATTR) === sourceOf(code)) continue;
		found.push({ block, code, source: sourceOf(code) });
	}
	return found;
}

/** Remove a previously inserted diagram, restoring the code view. */
function clearDiagram(block) {
	for (const node of block.querySelectorAll("[data-dsh-mermaid-diagram]")) node.remove();
}

/** Remove the inline "why this is still code" note. */
function clearError(code) {
	const parent = code?.parentElement;
	if (parent == null) return;
	for (const node of parent.querySelectorAll(":scope > [data-dsh-mermaid-error]")) node.remove();
}

/**
 * Explain, inside the document, why a block that looks like a diagram was left
 * as code. Silent failure is worse than an error: the reader cannot tell a
 * broken diagram from a missing feature.
 */
function showError(doc, code, message) {
	clearError(code);
	const note = doc.createElement("div");
	note.setAttribute("data-dsh-mermaid-error", "1");
	note.className = "dsh-mermaid-error";
	const first = String(message ?? "").split("\n")[0].trim();
	note.textContent = `mermaid: not rendered as a diagram — ${first.slice(0, 200) || "syntax error"}`;
	code.insertAdjacentElement("afterend", note);
}

/**
 * Render one descriptor and insert the SVG beside its source block.
 * The source is validated first: mermaid happily draws its own error artwork
 * for invalid text, which must never replace a code block.
 * @param descriptor - a result of {@link findDiagramBlocks}.
 * @param mermaid - the initialized mermaid API.
 * @param doc - document used to build nodes.
 * @param idPrefix - unique prefix for mermaid's temporary element ids.
 * @returns true when a diagram was inserted.
 */
export async function renderDiagram(descriptor, mermaid, doc, idPrefix = "dsh-mermaid") {
	const { block, code, source } = descriptor;
	block.setAttribute(BUSY_ATTR, "1");
	try {
		// Parse first: an invalid diagram must leave the code visible.
		if (typeof mermaid.parse === "function") {
			try {
				const parsed = await mermaid.parse(source, { suppressErrors: false });
				if (parsed === false) throw new Error("not a mermaid diagram");
			} catch (error) {
				block.removeAttribute(RENDERED_ATTR);
				block.setAttribute(FAILED_ATTR, source);
				clearDiagram(block);
				showError(doc, code, error?.message ?? error);
				console.warn("[dsh-mermaid] not a diagram (kept as code):", error?.message ?? error);
				return false;
			}
		}
		const id = `${idPrefix}-${Math.random().toString(36).slice(2, 10)}`;
		const { svg } = await mermaid.render(id, source);
		if (MERMAID_ERROR_MARKERS.some((marker) => svg.includes(marker))) throw new Error("mermaid reported a syntax error");
		clearDiagram(block);
		// An interactive viewer (pan, zoom, fit, expand) rather than a bare SVG.
		const holder = createDiagramViewer(doc, svg);
		// The diagram replaces the code view; the code element stays in the DOM as
		// the copy source and for a later re-render.
		clearError(code);
		code.style.display = "none";
		code.insertAdjacentElement("afterend", holder);
		block.setAttribute(RENDERED_ATTR, "1");
		block.removeAttribute(FAILED_ATTR);
		return true;
	} catch (error) {
		// Keep the code visible and remember this source so it is not retried
		// until it changes (streaming markdown re-emits a corrected block).
		block.removeAttribute(RENDERED_ATTR);
		block.setAttribute(FAILED_ATTR, source);
		clearDiagram(block);
		showError(doc, code, error?.message ?? error);
		console.warn("[dsh-mermaid] render failed:", error?.message ?? error);
		return false;
	} finally {
		block.removeAttribute(BUSY_ATTR);
	}
}

/** Drop every rendered diagram so the whole page can be re-rendered (theme change). */
export function forgetRendered(root) {
	if (root?.querySelectorAll == null) return;
	for (const block of root.querySelectorAll(`[${RENDERED_ATTR}]`)) {
		clearDiagram(block);
		block.removeAttribute(RENDERED_ATTR);
		for (const hidden of block.querySelectorAll(`${CANDIDATE_SELECTOR}`)) hidden.style.display = "";
		for (const note of block.querySelectorAll("[data-dsh-mermaid-error]")) note.remove();
	}
}
