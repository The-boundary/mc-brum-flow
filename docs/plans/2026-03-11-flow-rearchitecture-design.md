# Brum Flow Re-Architecture Design

**Date**: 2026-03-11
**Status**: Approved
**Schema**: `brum_flow` (fresh build, `brum` schema untouched)

## Overview

Complete re-architecture of the Brum Flow node graph. Replaces the old shot-centric model (Asset > Camera > SceneState > Resolution > Output) with a camera-first pipeline where cameras flow through processing stages via group-based routing. Groups are reference-based (cameras can belong to multiple groups), and group names automatically build output filenames.

## Pipeline Order (Strict, All Required)

```
Camera > Group > Light Setup > Tone Mapping > Layer Setup > Aspect Ratio > Stage Rev > Deadline/Local > Output
```

- Left-to-right only. No skipping stages, no reordering.
- An **Override node** (red) can be inserted inline after any processing stage to patch settings.

## Node Types

| Type | Role | Color | Config |
|---|---|---|---|
| Camera | Source node, from 3ds Max scene | Green | Read-only: name, class, max_handle |
| Group | Collector, bundles inputs, name = output filename segment | Orange | Name only |
| Light Setup | Corona lighting settings | Amber | Delta vs studio defaults |
| Tone Mapping | Corona Frame Buffer settings | Blue | Delta vs studio defaults |
| Layer Setup | Layer visibility on/off | Cyan | Delta: `{ "LayerName": bool }` |
| Aspect Ratio | Render ratio (16:9, etc.) | Teal | `{ ratio: "16:9" }` |
| Stage Rev | Render quality: longest edge, passes, noise, denoiser | Green | `{ longest_edge: 6000, passes: 50, ... }` |
| Override | Inline patch after any stage | Red | Delta: overrides any upstream setting |
| Deadline/Local | Render destination | Purple | `{ target: "deadline", repo: "..." }` or `{ target: "local" }` |
| Output | Terminal: file format, naming | Pink | `{ format: "EXR", bitDepth: 32 }` |

## Wire Colors & Behavior

- **Green wire** = individual camera path
- **Orange wire** = bundled paths from a Group node

All nodes accept both wire colors. Processing nodes preserve what they receive: 5 green + 2 orange in = 5 green + 2 orange out. Orange is a convenience for bulk-wiring — it doesn't change or restrict anything downstream.

## Group Mechanics

Groups are collector nodes that appear **at any stage** in the pipeline, not just for cameras.

- Cameras wire into groups (green into group = group collects that camera)
- Groups wire into groups (orange into group = group absorbs all paths)
- A camera can be in multiple groups (reference-based, not ownership)
- Each group→downstream-node connection creates paths for all cameras in that group

### Multiplication

Multiplication happens through wiring topology, not automatically:

- Group A (5 cams) → 1 Light Setup = 5 paths
- Group A (5 cams) → 2 Light Setups = 10 paths
- Each subsequent stage is a passthrough unless the user wires to multiple downstream nodes of the same type

### "Hide Previous Nodes"

Each Group node has a `hidePrevious` toggle:

- A camera node is visually hidden only when **every** group it feeds into has `hidePrevious: true`
- Same rule for any upstream node — hidden when all downstream groups referencing it agree
- Reference-counted: if any referencing group has `hidePrevious: false`, the node stays visible

## Delta / Inheritance Model

### Studio Defaults

Pre-populated in the DB from day one. Represents the studio's canonical render configuration. Not captured from a scene — maintained by leads as managed data.

~471 parameters across categories:
- Corona renderer: ~307
- Tone mapping chain: ~14
- Scene render output: ~15
- Environment: ~6
- Gamma/Color pipeline: ~4
- Physical Camera: ~53
- Free Camera: ~20
- Target Camera base: ~19
- CoronaCameraMod: ~33

Stored as structured JSON with type info, default values, min/max ranges, enum options (see `docs/max-parameters.json`).

### Node Configs (Deltas Only)

Each node stores only settings that differ from studio defaults:

```
Studio defaults: { passes: 30, noise: 0.03, longest_edge: 3000, denoise: true, ... } (500 fields)
Stage Rev "C":   { longest_edge: 6000, passes: 50 }                                   (2 fields)
Override "10K":  { longest_edge: 10000 }                                                (1 field)
```

### Resolution at Render Time

Walk the path from Camera to Output, start with studio defaults, apply each node's delta in order:

```
finalConfig = baseline → apply(Light delta) → apply(ToneMap delta) → apply(Layer delta) → apply(AspectRatio) → apply(StageRev delta) → apply(Override delta)
```

Later nodes win. Override nodes are just deltas — no special handling.

## Output Naming

Flat output folder, no subfolders. Filename built from Group node labels along the path + camera name + rev (always last):

```
{group} - {group} - {camera_name} - {rev_group}.{format}
```

Examples:
```
EXT - DAY - CAM_001 - RevC.exr
HERO - NIGHT - CAM_001 - RevA.exr
INT - WARM - CAM_002 - RevB.exr
```

Only Group node labels contribute to the filename. Processing node names (Light Setup, Tone Mapping, etc.) do NOT.

## Output Preview Panel

- Live list of all computed render paths with filenames
- Each path has an **enable/disable toggle**
- Total count: "3 / 17 renders active"
- Play/Render button sends only enabled paths
- Bulk actions: enable all, disable all, enable by group

## 3ds Max Identity & Sync

### Objects (Cameras, Lights)

Referenced by `inode.handle` (persistent integer, unique within scene, confirmed working in Max 2024). Stored with name + class as composite check:

```
max_handle: 4
max_class: "Physical"
name: "PhysicalCam_Test"
```

- Handle exists, name changed → **rename detected**, update label
- Handle no longer exists → **deleted**, flag node for reassignment
- Handle exists, class changed → **handle reuse** (suspicious), flag for user review

**Note**: `.guid` / `getNodeGUID` is NOT available in Max 2024. Do not rely on it.

### Layers

Name-based identity only. Layers have no stable ID in Max 2024 (no handle, no GUID). Renaming a layer = new layer from the flow's perspective.

New layers appearing in Max that aren't in any Layer Setup delta default to **hidden** (safe — nothing renders unexpectedly).

## Render Execution

- **Deadline**: Inject render job directly into Deadline's MongoDB (same proven technique as current Brum backend)
- **Local**: Send maxscript render command to 3ds Max via TCP bridge (set scene state + start render)

### "Push to Max" / Preview

Select an output path → click "Push to Max" → server resolves the complete config → sends via TCP → 3ds Max sets itself to that exact state.

Lets artists preview what a render will look like before submitting. Works as a quick scene-state switcher during production.

## UI Layout & Interactions

### Canvas (React Flow)

- Left-to-right pipeline layout
- Dark dot grid background
- Snap-to-grid
- Camera nodes far left, Output nodes far right

### Multi-select + Bulk Wire

- Click-drag to select multiple nodes
- Drag from any selected node's output handle → all selected nodes draw wires simultaneously
- Drop onto any valid downstream node to connect all at once

### Auto-suggest on Wire Drop

- Drag a wire from output handle, drop on empty canvas
- Dropdown appears showing valid next node types in pipeline order
- Shows both "New [Type]" and existing nodes of that type
- Guides users through the pipeline without memorizing order

### Node Config / Preset Library

- Each node type can have multiple named presets (e.g., 3 Layer setups, 2 Light setups, Rev A/B/C)
- Presets are `node_configs` rows — exist independently of the graph
- Preset library panel: browse, create, duplicate, rename, delete presets
- Edit delta settings per preset (toggle layers, adjust passes, etc.)
- Multiple graph nodes can reference the same preset — edit once, propagates everywhere
- "Detach as copy" to create a one-off variant

### Detail Panel (Right Side)

- Shows delta editor for selected processing node
- Unchanged fields shown greyed (studio default), changed fields highlighted
- Edit a field → added to delta. Reset a field → removed from delta (reverts to default)

### Override Node (Red)

- Visually distinct: red border, red accent
- Same delta editor with warning banner: "This overrides the standard pipeline"

## Database Schema (`brum_flow`)

### `scenes`
```sql
id          UUID PK DEFAULT gen_random_uuid()
name        TEXT NOT NULL
file_path   TEXT NOT NULL DEFAULT ''
instance_host TEXT NOT NULL DEFAULT ''
is_active   BOOLEAN NOT NULL DEFAULT TRUE
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### `cameras`
```sql
id          UUID PK DEFAULT gen_random_uuid()
scene_id    UUID FK → scenes ON DELETE CASCADE
name        TEXT NOT NULL
max_handle  INTEGER NOT NULL
max_class   TEXT NOT NULL DEFAULT ''
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE(scene_id, max_handle)
```

### `studio_defaults`
```sql
id          UUID PK DEFAULT gen_random_uuid()
category    TEXT NOT NULL UNIQUE (render, layers, camera, tone_mapping, lighting, environment, output)
settings    JSONB NOT NULL DEFAULT '{}'
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### `node_configs`
```sql
id          UUID PK DEFAULT gen_random_uuid()
node_type   TEXT NOT NULL (lightSetup, toneMapping, layerSetup, aspectRatio, stageRev, deadline, output, override)
label       TEXT NOT NULL
delta       JSONB NOT NULL DEFAULT '{}'
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### `flow_configs`
```sql
id          UUID PK DEFAULT gen_random_uuid()
scene_id    UUID FK → scenes ON DELETE CASCADE UNIQUE
nodes       JSONB NOT NULL DEFAULT '[]'
edges       JSONB NOT NULL DEFAULT '[]'
viewport    JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

## Shelved for Later

- Render status tracking on graph (polling Deadline MongoDB, progress indicators, wire animations)
- Multi-client real-time graph sync (Socket.IO infrastructure exists, not priority)
- Render history / versioning

## Key Decisions Log

| Decision | Rationale |
|---|---|
| Groups as nodes, not containers | Graph topology = routing + naming. No separate management UI. |
| Reference-based groups | Cameras can be in multiple groups. Solves cross-cutting routing. |
| Delta model | 471 parameters per render. Only store what changed. DB stays small. |
| Studio defaults pre-populated | Controlled standard, not a per-scene capture. Maintained by leads. |
| Strict pipeline order | All stages required. No ambiguity about missing settings. |
| `inode.handle` for identity | Persistent integer, confirmed Max 2024. GUID not available. |
| Layer name-based identity | No stable ID for layers in Max 2024. Rename = new layer. |
| Flat output naming | No subfolders. Group names + camera + rev build the filename. |
| Deadline via MongoDB injection | Proven fast technique from existing Brum backend. |
| Fresh schema | `brum_flow` rebuilt from scratch. `brum` untouched. |
