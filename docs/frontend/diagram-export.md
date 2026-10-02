# Architecture Diagram Export

The Diagram Export feature lets users save any architecture or dependency graph as a high-resolution **PNG** or **SVG** file directly from the browser — no server round-trip needed.

## Architecture

This feature is entirely client-side and uses the [`html-to-image`](https://github.com/bubkoo/html-to-image) library to serialize a live DOM subtree into an image.

## Components

### `exportDiagram.js` (`client/src/shared/utils/`)

Core utility with two exports:

| Function                            | Description                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| `exportToPng(elementRef, filename)` | Captures the element as a PNG and triggers a browser download  |
| `exportToSvg(elementRef, filename)` | Captures the element as an SVG and triggers a browser download |

Both functions:

- Apply a consistent dark background (`#0a0a0f`) matching the app theme
- Filter out ReactFlow controls, minimap, and the export button itself via a `export-exclude` CSS class guard
- Trigger a native `<a download>` click to save the file

### `ExportDiagramButton.jsx` (`client/src/shared/components/`)

A reusable dropdown button that wraps the export utility. Props:

| Prop         | Type              | Description                                                 |
| ------------ | ----------------- | ----------------------------------------------------------- |
| `elementRef` | `React.RefObject` | Ref attached to the diagram wrapper element                 |
| `filename`   | `string`          | Base filename without extension (e.g. `"dependency-graph"`) |
| `className`  | `string`          | Optional additional class names                             |

The button shows a loading spinner while the export is in progress and catches errors with a user-facing alert.

## Usage

The button has been integrated into:

1. **`ArchitecturePage.jsx`** — Export button in the top-right toolbar next to the view-mode toggle
2. **`DependencyGraphPage.jsx`** — Export button in the top-right corner of the graph canvas

To add the export button to a future diagram page:

```jsx
import { useRef } from 'react';
import { ExportDiagramButton } from '../../shared/components/ExportDiagramButton';

// 1. Create a ref and attach it to the diagram container
const diagramRef = useRef(null);

// 2. Place the button wherever you want
<div ref={diagramRef} className="diagram-container">
  <ExportDiagramButton elementRef={diagramRef} filename="my-diagram" />
  {/* ...diagram content */}
</div>;
```

## Notes

- SVG export may not perfectly capture canvas-based elements (e.g. WebGL nodes). PNG is the more reliable format for complex React Flow graphs.
- For very large graphs, the export may be slow. The button displays a loading state during the operation.
- UI chrome (controls, minimap, the export button itself) is automatically filtered from the export via the `export-exclude` CSS class.
