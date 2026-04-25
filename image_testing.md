# Image Integration Testing Playbook (Toolbox AI)

## Test Agent Rules — Image Integration

### Image Handling Rules
- Always use **base64-encoded** JPEG/PNG/WEBP images for tests
- Do **not** use SVG, BMP, HEIC, or other formats
- Do **not** upload blank, solid-color, or uniform-variance images
- Every test image must contain real visual features (edges, textures, objects)
- If image format mismatches MIME after transformation, re-detect and update MIME
- For animated images (GIF/APNG), extract first frame only
- Resize oversized images to reasonable bounds (< 2 MB)

## Toolbox Analyze Endpoint
`POST /api/toolbox/analyze`
- Body: `{ "image_base64": "<base64-without-data-prefix>" }`
- Returns: `{ "suggested_drawers": int, "labels": ["Drawer 1", ...], "notes": "..." }`
- Provider: Gemini 2.5 Pro via emergentintegrations
- Auth: uses EMERGENT_LLM_KEY from `/app/backend/.env`

## Acceptable Test Image
- Use a real photograph (toolbox, workbench, garage shelf)
- JPEG ~ 800–1600 px wide
- Base64-encoded; no `data:image/...` prefix in the JSON body
