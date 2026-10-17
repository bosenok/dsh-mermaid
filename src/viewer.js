// Interactive diagram viewer: the mermaid SVG plus pan, zoom, fit and expand.
// The geometry helpers are pure so they can be tested without a browser; the
// DOM wiring stays thin and only translates events into state changes.

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 8;
/** Wheel sensitivity: one notch is a few percent of scale. */
const WHEEL_FACTOR = 0.0016;

/** Keep a scale inside the supported range. */
export function clampScale(scale) {
	if (Number.isFinite(scale) === false || scale <= 0) return 1;
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Natural pixel size of a rendered mermaid SVG (viewBox first, then attributes). */
export function naturalSizeOf(svg) {
	const viewBox = svg?.getAttribute?.("viewBox");
	if (typeof viewBox === "string" && viewBox.length > 0) {
		const parts = viewBox.split(/[\s,]+/u).map(Number);
		if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return { width: parts[2], height: parts[3] };
	}
	const width = Number.parseFloat(svg?.getAttribute?.("width") ?? "");
	const height = Number.parseFloat(svg?.getAttribute?.("height") ?? "");
	if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return { width, height };
	return { width: 800, height: 600 };
}

/** Scale that fits the whole diagram into the viewport; never enlarges past 1. */
export function fitScale(natural, viewport, padding = 24) {
	if (natural.width <= 0 || natural.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 1;
	const width = Math.max(1, viewport.width - padding);
	const height = Math.max(1, viewport.height - padding);
	return clampScale(Math.min(1, Math.min(width / natural.width, height / natural.height)));
}

/** Centre a diagram of `natural` size inside `viewport` at `scale`. */
export function centerOffset(natural, viewport, scale) {
	return {
		x: Math.max(0, (viewport.width - natural.width * scale) / 2),
		y: Math.max(0, (viewport.height - natural.height * scale) / 2),
	};
}

/**
 * Zoom about a viewport point: the diagram point under the cursor keeps its
 * screen position, which is what makes wheel zoom feel anchored.
 */
export function zoomAt(state, nextScale, point) {
	const scale = clampScale(nextScale);
	const ratio = state.scale === 0 ? 1 : scale / state.scale;
	return {
		scale,
		x: point.x - (point.x - state.x) * ratio,
		y: point.y - (point.y - state.y) * ratio,
	};
}

/** One wheel notch → the next scale. */
export function wheelScale(scale, deltaY) {
	return clampScale(scale * Math.exp(-deltaY * WHEEL_FACTOR));
}

/**
 * A finite transform state. Events without coordinates (synthetic events,
 * assistive tooling) must never poison the transform with NaN, which would
 * move the diagram out of view.
 */
export function sanitizeState(next) {
	return {
		scale: clampScale(next?.scale),
		x: Number.isFinite(next?.x) ? next.x : 0,
		y: Number.isFinite(next?.y) ? next.y : 0,
	};
}

/** Viewport-relative pointer position, falling back to the viewport centre. */
function pointIn(viewport, event) {
	const rect = viewport.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
	const width = rect.width || viewport.clientWidth || 600;
	const height = rect.height || viewport.clientHeight || 320;
	return {
		x: Number.isFinite(event?.clientX) ? event.clientX - (rect.left ?? 0) : width / 2,
		y: Number.isFinite(event?.clientY) ? event.clientY - (rect.top ?? 0) : height / 2,
	};
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Build the viewer around one rendered SVG.
 * @param doc - document used to create nodes.
 * @param svgText - the mermaid SVG markup.
 * @returns the root element, with its controller attached as `dshViewer`.
 */
export function createDiagramViewer(doc, svgText) {
	const root = doc.createElement("div");
	root.className = "dsh-mermaid-diagram";
	root.setAttribute("data-dsh-mermaid-diagram", "1");
	root.innerHTML = svgText;
	const svg = root.querySelector("svg");
	if (svg != null) {
		// Mermaid ships `width:100%; max-width:Npx`; the viewer owns sizing.
		// Clear its inline style FIRST, then pin the natural size.
		svg.removeAttribute("style");
		svg.style.maxWidth = "none";
		const size = naturalSizeOf(svg);
		svg.setAttribute("width", String(size.width));
		svg.setAttribute("height", String(size.height));
	}

	const toolbar = doc.createElement("div");
	toolbar.className = "dsh-mermaid-toolbar";
	const button = (action, label, title) => {
		const node = doc.createElement("button");
		node.type = "button";
		node.className = "dsh-mermaid-button";
		node.setAttribute("data-action", action);
		node.title = title;
		node.textContent = label;
		toolbar.appendChild(node);
		return node;
	};
	button("out", "−", "Zoom out");
	const zoomLabel = doc.createElement("span");
	zoomLabel.className = "dsh-mermaid-zoom";
	zoomLabel.textContent = "100%";
	toolbar.appendChild(zoomLabel);
	button("in", "+", "Zoom in");
	button("fit", "fit", "Fit to view");
	button("reset", "1:1", "Actual size");
	button("expand", "⤢", "Expand");
	root.appendChild(toolbar);

	const viewport = doc.createElement("div");
	viewport.className = "dsh-mermaid-viewport";
	const canvas = doc.createElement("div");
	canvas.className = "dsh-mermaid-canvas";
	if (svg != null) canvas.appendChild(svg);
	viewport.appendChild(canvas);
	root.appendChild(viewport);

	const natural = naturalSizeOf(svg ?? doc.createElementNS(SVG_NS, "svg"));
	let state = { scale: 1, x: 0, y: 0 };
	let userAdjusted = false;
	const pointers = new Map();
	let pinchDistance = null;

	const viewportSize = () => ({ width: viewport.clientWidth || root.clientWidth || 600, height: viewport.clientHeight || 320 });

	function apply() {
		canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
		zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
	}
	function place(next, adjusted = true) {
		state = sanitizeState(next);
		userAdjusted = adjusted || userAdjusted;
		apply();
	}
	function fit() {
		const scale = fitScale(natural, viewportSize());
		place({ scale, ...centerOffset(natural, viewportSize(), scale) }, false);
	}
	function reset() {
		const scale = 1;
		place({ scale, ...centerOffset(natural, viewportSize(), scale) });
	}
	function zoomBy(factor) {
		const size = viewportSize();
		place(zoomAt(state, state.scale * factor, { x: size.width / 2, y: size.height / 2 }));
	}

	viewport.addEventListener(
		"wheel",
		(event) => {
			event.preventDefault();
			place(zoomAt(state, wheelScale(state.scale, Number.isFinite(event.deltaY) ? event.deltaY : 0), pointIn(viewport, event)));
		},
		{ passive: false },
	);
	viewport.addEventListener("dblclick", () => fit());
	viewport.addEventListener("pointerdown", (event) => {
		pointers.set(event.pointerId, pointIn(viewport, event));
		viewport.setPointerCapture?.(event.pointerId);
		viewport.setAttribute("data-panning", "");
	});
	viewport.addEventListener("pointermove", (event) => {
		const previous = pointers.get(event.pointerId);
		if (previous == null) return;
		const current = pointIn(viewport, event);
		pointers.set(event.pointerId, current);
		if (pointers.size >= 2) {
			// Pinch: scale by the change of the distance between two pointers.
			const [a, b] = [...pointers.values()];
			const distance = Math.hypot(a.x - b.x, a.y - b.y);
			if (pinchDistance != null && distance > 0) {
				const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				place(zoomAt(state, state.scale * (distance / pinchDistance), middle));
			}
			pinchDistance = distance;
			return;
		}
		place({ scale: state.scale, x: state.x + (current.x - previous.x), y: state.y + (current.y - previous.y) });
	});
	const release = (event) => {
		pointers.delete(event.pointerId);
		if (pointers.size < 2) pinchDistance = null;
		if (pointers.size === 0) viewport.removeAttribute("data-panning");
	};
	viewport.addEventListener("pointerup", release);
	viewport.addEventListener("pointercancel", release);
	viewport.addEventListener("pointerleave", release);

	toolbar.addEventListener("click", (event) => {
		const action = event.target?.getAttribute?.("data-action");
		if (action === "in") zoomBy(1.25);
		else if (action === "out") zoomBy(1 / 1.25);
		else if (action === "fit") fit();
		else if (action === "reset") reset();
		else if (action === "expand") {
			const expanded = root.hasAttribute("data-expanded");
			if (expanded) root.removeAttribute("data-expanded");
			else root.setAttribute("data-expanded", "");
			// The viewport changes size with the expansion.
			requestAnimationFrame(() => fit());
		}
	});

	// Re-fit while the user has not taken over (panel resizes, tab switches).
	const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
		if (userAdjusted === false) fit();
	}) : null;
	observer?.observe(viewport);

	const controller = {
		fit,
		reset,
		zoomBy,
		expand: () => root.setAttribute("data-expanded", ""),
		get state() {
			return { ...state };
		},
		get natural() {
			return { ...natural };
		},
		dispose: () => observer?.disconnect(),
	};
	root.dshViewer = controller;
	apply();
	fit();
	return root;
}
