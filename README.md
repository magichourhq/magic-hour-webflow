# Magic Hour for Webflow

A Webflow Designer Extension that generates an image with Magic Hour, uploads the result to the current site's Assets, and can insert it after the selected canvas element.

## User flow

1. Open Magic Hour from the Webflow Designer Apps pane.
2. Enter a Magic Hour API key and image prompt.
3. Choose aspect ratio and resolution.
4. Generate the image.
5. The extension polls the asynchronous project, uploads the completed image to Webflow Assets, applies prompt-derived alt text, and optionally inserts it on the canvas.

The API key stays in React memory for the current extension session. It is sent only to `api.magichour.ai` and is never persisted.

## Development

Requirements: Node.js 16.20 or later, a registered Webflow App with the Designer Extension capability, and a Webflow test site.

```bash
npm install
npm run dev
```

Install the development App on a Webflow test site, open the Apps pane in Designer, and choose **Launch development app**.

## Build

```bash
npm run lint
npm run build
```

The build creates `bundle.zip`, ready for the Webflow App version uploader. Marketplace submission is a separate Webflow review step and is not performed by this repository.

## API behavior

- `GET /v1/account` validates the user-supplied API key without consuming credits.
- `POST /v1/ai-image-generator` starts one image using Magic Hour's recommended model.
- `GET /v1/image-projects/{id}` retrieves status and the signed output URL.
- Webflow's Designer API creates the site asset and inserts an Image element when requested.

Generation consumes Magic Hour credits. Available resolutions depend on the user's Magic Hour plan and the selected default model.
