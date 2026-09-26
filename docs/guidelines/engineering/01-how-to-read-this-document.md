# 1. How to read this document

Rules use the words **must**, **should** and **may** in their RFC 2119 sense. Rules marked **(lint)** are enforced automatically in CI; everything else is enforced in review. Section references such as "spec §8" point to the Product and Technical Specification.

These decisions from the specification's resolved questions shape the rules below:

- JavaScript only. Types come from JSDoc, never from TypeScript source.
- Real-time sync (R4) is built in-house, with no third-party CRDT library.
- Node 20+ is required for the CLI and all development tooling.
- The only runtime dependencies are D3.js and Three.js.
- The code is proprietary until licensing is revisited before the first public release. Vendored code keeps its own licence: D3 is ISC, Three.js is MIT and IBM Plex is OFL.

---
Part of the [Strata Engineering Guidelines](README.md).
