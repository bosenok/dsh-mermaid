// Host half of the dsh-mermaid plugin.
// Rendering happens entirely in the browser (the markdown DOM plus the mermaid
// library), so the host half has nothing to do beyond existing as a loader row.
const name = "mermaid";

function apply() {
	// intentionally empty: this plugin is client-only
}

export { apply, name };
