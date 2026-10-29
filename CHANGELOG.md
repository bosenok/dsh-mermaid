# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- Mermaid fenced blocks render as diagrams in chat messages and code cards,
  including streaming markdown and re-renders.
- The right-Sidebar document preview renders diagrams too, so `.md` files show
  them without extra steps (the card keeps its copy header and gains the viewer
  toolbar).
- The interactive viewer: drag to pan, wheel/pinch zoom, fit, 1:1 and fullscreen
  (the Fullscreen API first, a fixed overlay as the fallback; Escape exits).
- Diagrams re-render with the other palette when the theme changes.

### Changed

- While a diagram is shown, the code card's banner/header is hidden and the
  source copy action moves into the viewer toolbar; both return when the diagram
  is cleared.
- The documentation is English and names the covered surfaces, and a regression
  fixture pins the document-preview card shape.
- Build-time packages moved to `devDependencies`; the plugin is packaged as a
  DSH bundle.
