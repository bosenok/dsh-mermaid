// Viewer geometry + interaction test: pure math first, then the real DOM
// wiring under happy-dom (buttons, wheel, drag) so the interactive behaviour
// cannot regress unnoticed.
import { Window } from "happy-dom";
import { MAX_SCALE, MIN_SCALE, centerOffset, clampScale, createDiagramViewer, fitScale, naturalSizeOf, wheelScale, zoomAt } from "../src/viewer.js";

const window = new Window({ url: "http://localhost/" });
const doc = window.document;

let failed = false;
const check = (label, condition) => {
	console.log(`${condition ? "[ok]" : "[FAIL]"} ${label}`);
	if (!condition) failed = true;
};
const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;

// ── pure geometry ───────────────────────────────────────────────────────────
check("scale clamped to the range", clampScale(100) === MAX_SCALE && clampScale(0.001) === MIN_SCALE);
check("invalid scale falls back to 1", clampScale(Number.NaN) === 1);

const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("viewBox", "0 0 1200 600");
check("natural size from viewBox", naturalSizeOf(svg).width === 1200 && naturalSizeOf(svg).height === 600);

check("fit shrinks a large diagram", near(fitScale({ width: 1200, height: 600 }, { width: 600, height: 320 }), 0.48, 0.02));
check("fit never enlarges", fitScale({ width: 100, height: 100 }, { width: 600, height: 320 }) === 1);

const centered = centerOffset({ width: 1200, height: 600 }, { width: 600, height: 320 }, 0.48);
check("centre offset is symmetric", near(centered.x, (600 - 1200 * 0.48) / 2) && near(centered.y, (320 - 600 * 0.48) / 2));

// Zoom must keep the point under the cursor fixed on screen.
const before = { scale: 1, x: 10, y: 20 };
const pointer = { x: 100, y: 80 };
const after = zoomAt(before, 2, pointer);
const diagramX = (pointer.x - before.x) / before.scale;
check("zoom keeps the cursor anchored", near(after.x + diagramX * after.scale, pointer.x) && near(after.scale, 2));
check("zoom clamps at the maximum", zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, MAX_SCALE * 2, pointer).scale === MAX_SCALE);

check("wheel up zooms in", wheelScale(1, -100) > 1);
check("wheel down zooms out", wheelScale(1, 100) < 1);
check("wheel respects the scale range", wheelScale(MAX_SCALE, -10000) === MAX_SCALE && wheelScale(MIN_SCALE, 10000) === MIN_SCALE);

// ── DOM wiring ──────────────────────────────────────────────────────────────
const viewer = createDiagramViewer(doc, '<svg viewBox="0 0 400 200"><rect width="400" height="200"/></svg>');
doc.body.appendChild(viewer);
const controller = viewer.dshViewer;
check("viewer exposes a controller", controller != null);
check("toolbar rendered", viewer.querySelectorAll(".dsh-mermaid-button").length === 5);
check("zoom label rendered", viewer.querySelector(".dsh-mermaid-zoom")?.textContent === "100%");
check("svg sized from the viewBox", viewer.querySelector("svg")?.getAttribute("width") === "400");
check("svg max-width released", viewer.querySelector("svg")?.style.maxWidth === "none");
check("canvas transform has no NaN", /NaN/.test(String(viewer.querySelector(".dsh-mermaid-canvas").style.transform)) === false);

const zoomLabel = () => viewer.querySelector(".dsh-mermaid-zoom").textContent;
const click = (action) => {
	const button = viewer.querySelector(`[data-action="${action}"]`);
	button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
};

click("in");
check("zoom-in button raises the scale", controller.state.scale > 1);
check("zoom label follows the scale", zoomLabel() !== "100%");
click("out");
click("out");
check("zoom-out button lowers the scale", controller.state.scale < 1);
click("reset");
check("1:1 restores the actual size", controller.state.scale === 1 && zoomLabel() === "100%");

controller.zoomBy(100);
check("programmatic zoom is clamped", controller.state.scale === MAX_SCALE);
click("fit");
check("fit returns inside the range", controller.state.scale <= 1 && controller.state.scale >= MIN_SCALE);

// Wheel zoom, as a user performs it.
const viewport = viewer.querySelector(".dsh-mermaid-viewport");
const scaleBeforeWheel = controller.state.scale;
viewport.dispatchEvent(new window.WheelEvent("wheel", { deltaY: -240, bubbles: true, cancelable: true }));
check("wheel zooms the diagram", controller.state.scale > scaleBeforeWheel);
check("wheel without coordinates keeps finite state", Number.isFinite(controller.state.x) && Number.isFinite(controller.state.y));

// Drag to pan.
const beforeDrag = controller.state;
viewport.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }));
viewport.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 130, bubbles: true }));
viewport.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 1, clientX: 140, clientY: 130, bubbles: true }));
check("drag pans by the pointer delta", near(controller.state.x, beforeDrag.x + 40) && near(controller.state.y, beforeDrag.y + 30));
check("panning flag cleared after release", viewport.hasAttribute("data-panning") === false);

// Expand toggle + dispose.
click("expand");
check("expand marks the viewer", viewer.hasAttribute("data-expanded"));
click("expand");
check("expand toggles back", viewer.hasAttribute("data-expanded") === false);
// Copy source: the toolbar carries what the hidden card header used to.
let copied = null;
try {
	Object.defineProperty(window.navigator, "clipboard", {
		value: { writeText: async (text) => { copied = text; } },
		configurable: true,
	});
} catch {
	copied = undefined;
}
const withSource = createDiagramViewer(doc, '<svg viewBox="0 0 300 100"><rect width="300" height="100"/></svg>', {
	source: "flowchart LR\n  A-->B",
});
doc.body.appendChild(withSource);
check(
	"copy button appears only with a source",
	withSource.querySelectorAll(".dsh-mermaid-button").length === 6 && withSource.querySelector('[data-action="copy"]') != null,
);
withSource.querySelector('[data-action="copy"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 30));
if (copied !== undefined) check("copy writes the mermaid source", copied === "flowchart LR\n  A-->B");
const sourceController = withSource.dshViewer;
sourceController.expand();
check("expand overlay opens without the fullscreen API", withSource.hasAttribute("data-expanded"));
sourceController.collapse();
check("collapse closes the overlay", withSource.hasAttribute("data-expanded") === false);
sourceController.dispose();

controller.dispose();
check("dispose is safe", true);

console.log(failed ? "VIEWER TEST FAILED" : "VIEWER TEST OK");
process.exit(failed ? 1 : 0);
