// Detection/insertion test for the mermaid post-processor. It reproduces the
// DOM shapes the harness actually renders — the markdown code block, the code
// card whose banner reads "Code block" instead of a language, the verbatim
// source view, and a diff — and drives the real code with a stub renderer.
import { Window } from "happy-dom";
import { findDiagramBlocks, firstLineOf, forgetRendered, languageLabelOf, looksLikeDiagram, renderDiagram, sourceOf } from "../src/diagrams.js";

const window = new Window({ url: "http://localhost/" });
const doc = window.document;

/** Markdown fenced block: the banner carries the info string. */
function markdownBlock(language, source) {
	const block = doc.createElement("div");
	block.className = "_block_7gxqk_4";
	block.innerHTML = `
		<div class="_bannerWrap_7gxqk_24"><div class="_banner_7gxqk_24">
			<span class="_infostring_7gxqk_45">${language}</span>
			<div class="_action_7gxqk_56"><button>copy</button></div>
		</div></div>
		<div class="_content_7gxqk_74"><pre class="_shiki_7gxqk_93"><code></code></pre></div>`;
	doc.body.appendChild(block);
	// NOTE: set the source through textContent — happy-dom mis-parses "-->" when
	// it arrives inside innerHTML text, which would corrupt the fixture.
	block.querySelector("pre code").textContent = source;
	return block;
}

/** Code card: the banner reads a generic "Code block" label, language absent. */
function codeCard(source) {
	const card = doc.createElement("div");
	card.className = "_card_1pq26_1";
	card.innerHTML = `
		<div class="_header_1pq26_10"><div class="_heading_1pq26_23"><span class="_title_1pq26_36">Code block</span></div>
		<div class="_actions_1pq26_43"><button>copy</button></div></div>
		<div class="_body_1pq26_79"><pre><code></code></pre></div>`;
	doc.body.appendChild(card);
	card.querySelector("pre code").textContent = source;
	return card;
}

/** Code card whose body renders line elements instead of a <pre>. */
function lineCard(source) {
	const card = doc.createElement("div");
	card.className = "_card_1pq26_1";
	card.innerHTML = `<div class="_header_1pq26_10"><span class="_title_1pq26_36">Code block</span></div>
		<div class="_body_1pq26_79"><div class="_code_9x_1"><div class="_line_9x_1"></div><div class="_line_9x_1"></div></div></div>`;
	doc.body.appendChild(card);
	const lines = card.querySelectorAll("._line_9x_1");
	lines[0].textContent = source.split("\n")[0];
	lines[1].textContent = source.split("\n").slice(1).join(" ");
	return card;
}

/** Verbatim file view: the harness marks it with data-textpreview-plain. */
function sourceView(text) {
	const view = doc.createElement("div");
	view.className = "_textDocument_1ay0u_1";
	view.setAttribute("data-textpreview-plain", "true");
	view.innerHTML = '<pre class="_page_1ay0u_1"></pre>';
	doc.body.appendChild(view);
	view.querySelector("pre").textContent = text;
	return view;
}

const stubMermaid = {
	async parse(source) {
		if (source.includes("BROKEN")) throw new Error("Parse error on line 1");
		return true;
	},
	async render(_id, source) {
		if (source.includes("SYNTAXERROR")) {
			return { svg: '<svg aria-roledescription="error"><text>Syntax error in text</text></svg>' };
		}
		return { svg: `<svg data-stub="1"><text>${source.length}</text></svg>` };
	},
};

let failed = false;
const check = (label, condition) => {
	console.log(`${condition ? "[ok]" : "[FAIL]"} ${label}`);
	if (!condition) failed = true;
};

const FLOWCHART = 'flowchart LR\n  subgraph M["Modules"]\n    M1["1 Reference"]\n  end';

// ── content detection ───────────────────────────────────────────────────────
check("flowchart first line recognised", looksLikeDiagram(FLOWCHART));
check("graph TD; A-->B; recognised", looksLikeDiagram("graph TD; A-->B;"));
check("sequenceDiagram recognised", looksLikeDiagram("sequenceDiagram\n  A->>B: hi"));
check("indented first line recognised", looksLikeDiagram("\n\n   flowchart LR\n A-->B"));
check("plain code is not a diagram", looksLikeDiagram("const a = 1;\ngraph TD") === false);
check("prose is not a diagram", looksLikeDiagram("This graph TD is text") === false);
check("keyword enumeration is not a diagram", looksLikeDiagram("graph TD/TB/RL/LR · flowchart · sequenceDiagram · classDiagram") === false);
check("flowchart with trailing prose is not a diagram", looksLikeDiagram("flowchart LR — module diagram") === false);
check("firstLineOf trims blanks", firstLineOf("\n\n  flowchart LR  \n") === "flowchart LR");

// ── the shape from the screenshot: generic banner, no language ──────────────
const card = codeCard(FLOWCHART);
check("code card with a generic banner is detected", findDiagramBlocks(doc.body).some((d) => d.code.closest("._card_1pq26_1") === card));

const labelled = markdownBlock("mermaid", "graph TD; A-->B;");
check("labelled markdown block is detected", findDiagramBlocks(doc.body).some((d) => d.code.closest("._block_7gxqk_4") === labelled));

const jsBlock = markdownBlock("javascript", "const a = 1;");
check("non-diagram language ignored", findDiagramBlocks(doc.body).some((d) => d.code.closest("._block_7gxqk_4") === jsBlock) === false);

const emptyBlock = markdownBlock("mermaid", "   ");
check("empty source ignored", findDiagramBlocks(doc.body).some((d) => d.code.closest("._block_7gxqk_4") === emptyBlock) === false);

// ── views that must stay verbatim ───────────────────────────────────────────
const source = sourceView(`# Heading\n\n\`\`\`mermaid\n${FLOWCHART}\n\`\`\``);
check("verbatim source view untouched", findDiagramBlocks(doc.body).some((d) => d.code.closest("[data-textpreview-plain]") != null) === false);

const diff = doc.createElement("div");
diff.className = "_diff_7gxqk_1";
diff.innerHTML = "<pre></pre>";
	diff.querySelector("pre").textContent = "+" + FLOWCHART;
doc.body.appendChild(diff);
check("diff view untouched", findDiagramBlocks(doc.body).some((d) => d.code.closest('[class*="_diff_"]') != null) === false);

// A page of the source view that happens to start with a keyword stays text.
const pageStart = sourceView("flowchart LR\n  A-->B");
check("source page starting with a keyword stays text", findDiagramBlocks(doc.body).some((d) => d.code.closest("._textDocument_1ay0u_1") === pageStart) === false);

// ── structural independence: line-element card without any <pre> ────────────
const lineCardNode = lineCard("sequenceDiagram\n  A->>B: hi");
const lineDescriptor = findDiagramBlocks(doc.body).find((d) => d.block === lineCardNode);
check("card with line elements instead of a pre is detected", lineDescriptor != null);
check("code container excludes the header", lineDescriptor?.code.className.includes("_body_1pq26_79") === true);
const lineRendered = await renderDiagram(lineDescriptor, stubMermaid, doc);
check("line-element card renders", lineRendered === true && lineCardNode.querySelector("[data-dsh-mermaid-diagram] svg") != null);
check("only the code view is hidden", lineCardNode.querySelector("pre") == null && lineCardNode.querySelector("._body_1pq26_79").style.display === "none");

// ── rendering ───────────────────────────────────────────────────────────────
const descriptor = findDiagramBlocks(doc.body).find((d) => d.code.closest("._card_1pq26_1") === card);
const rendered = await renderDiagram(descriptor, stubMermaid, doc);
check("render succeeds", rendered === true);
check("diagram inserted in the card", card.querySelector("[data-dsh-mermaid-diagram] svg") != null);
check("code view hidden, source kept for copying", descriptor.code.style.display === "none" && card.querySelector("pre") != null);
check("card marked rendered", card.getAttribute("data-mermaid-rendered") === "1");
check("rendered card is not re-detected", findDiagramBlocks(doc.body).some((d) => d.code.closest("._card_1pq26_1") === card) === false);
check("sibling label still detected", findDiagramBlocks(doc.body).some((d) => d.code.closest("._block_7gxqk_4") === labelled));
check("label read from the markdown banner", languageLabelOf(labelled.querySelector("pre"), labelled) === "mermaid");
check("no label on the code card", languageLabelOf(card.querySelector("pre"), card) === "");

// ── failure paths ───────────────────────────────────────────────────────────
const broken = codeCard("flowchart LR\n  BROKEN");
const brokenDescriptor = findDiagramBlocks(doc.body).find((d) => d.code.closest("._card_1pq26_1") === broken);
const brokenResult = await renderDiagram(brokenDescriptor, stubMermaid, doc);
check("unparseable source returns false", brokenResult === false);
check("unparseable block keeps code visible", broken.querySelector("pre").style.display !== "none");
check("unparseable block got no diagram", broken.querySelector("[data-dsh-mermaid-diagram]") == null);
check("unparseable source is not retried", findDiagramBlocks(doc.body).some((d) => d.code.closest("._card_1pq26_1") === broken) === false);
check("unparseable block explains itself inline", broken.querySelector("[data-dsh-mermaid-error]")?.textContent.includes("not rendered as a diagram") === true);
check("explanation carries mermaid's reason", broken.querySelector("[data-dsh-mermaid-error]")?.textContent.includes("Parse error") === true);

broken.querySelector("pre code").textContent = "flowchart LR\n  A-->C";
check("changed source is retried", findDiagramBlocks(doc.body).some((d) => d.code.closest("._card_1pq26_1") === broken));
const repaired = findDiagramBlocks(doc.body).find((d) => d.code.closest("._card_1pq26_1") === broken);
await renderDiagram(repaired, stubMermaid, doc);
check("successful render clears the explanation", broken.querySelector("[data-dsh-mermaid-error]") == null);

// Mermaid answers invalid text with its own error artwork: never show it.
const errorArt = codeCard("flowchart LR\n  SYNTAXERROR");
const errorDescriptor = findDiagramBlocks(doc.body).find((d) => d.code.closest("._card_1pq26_1") === errorArt);
const errorResult = await renderDiagram(errorDescriptor, stubMermaid, doc);
check("error artwork is rejected", errorResult === false);
check("error artwork is not inserted", errorArt.querySelector("[data-dsh-mermaid-diagram]") == null);
check("error artwork block keeps code", errorArt.querySelector("pre").style.display !== "none");

// ── reset ───────────────────────────────────────────────────────────────────
forgetRendered(doc.body);
check("diagram cleared on forget", card.querySelector("[data-dsh-mermaid-diagram]") == null);
check("source restored on forget", card.querySelector("pre").style.display === "");
check("cleared block is detectable again", findDiagramBlocks(doc.body).some((d) => d.code.closest("._card_1pq26_1") === card));
check("source read from the <pre>", sourceOf(card.querySelector("pre")).includes("Reference"));

console.log(failed ? "DIAGRAMS TEST FAILED" : "DIAGRAMS TEST OK");
process.exit(failed ? 1 : 0);
