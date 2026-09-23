import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";

const API_BASE_URL = "https://api.magichour.ai/v1";
const TERMINAL_STATUSES = new Set(["complete", "error", "canceled"]);

type Project = {
  status: string;
  downloads?: Array<{ url: string }>;
  error?: { message?: string } | null;
};

type ApiError = { message?: string };

const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Generation canceled", "AbortError"));
      },
      { once: true },
    );
  });

const apiRequest = async <T,>(
  path: string,
  apiKey: string,
  signal: AbortSignal,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Magic Hour returned ${response.status}`;
    try {
      const error = (await response.json()) as ApiError;
      if (error.message) message = error.message;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
};

const extensionFor = (mimeType: string) => {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
};

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [insertOnCanvas, setInsertOnCanvas] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    const key = apiKey.trim();
    const imagePrompt = prompt.trim();
    if (!key || !imagePrompt) {
      setError("Enter a Magic Hour API key and prompt.");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setRunning(true);
    setError("");

    try {
      setStatus("Checking connection…");
      await apiRequest("/account", key, abortController.signal);

      setStatus("Starting generation…");
      const created = await apiRequest<{ id: string }>(
        "/ai-image-generator",
        key,
        abortController.signal,
        {
          method: "POST",
          body: JSON.stringify({
            image_count: 1,
            model: "default",
            aspect_ratio: aspectRatio,
            resolution,
            style: { prompt: imagePrompt, tool: "general" },
          }),
        },
      );

      let project: Project = { status: "queued" };
      for (let attempt = 0; attempt < 120; attempt += 1) {
        setStatus(`Generating image… ${project.status}`);
        await wait(3000, abortController.signal);
        project = await apiRequest<Project>(
          `/image-projects/${encodeURIComponent(created.id)}`,
          key,
          abortController.signal,
        );
        if (TERMINAL_STATUSES.has(project.status)) break;
      }

      if (project.status !== "complete" || !project.downloads?.[0]?.url) {
        throw new Error(
          project.error?.message ??
            (project.status === "canceled"
              ? "Generation was canceled."
              : "Generation did not complete in time."),
        );
      }

      setStatus("Adding image to Webflow Assets…");
      const imageResponse = await fetch(project.downloads[0].url, {
        signal: abortController.signal,
      });
      if (!imageResponse.ok) throw new Error("Could not download the generated image.");

      const imageBlob = await imageResponse.blob();
      if (!imageBlob.type.startsWith("image/")) {
        throw new Error("Magic Hour returned an unsupported file type.");
      }

      const imageFile = new File(
        [imageBlob],
        `magic-hour-${created.id}.${extensionFor(imageBlob.type)}`,
        { type: imageBlob.type },
      );
      const asset = await webflow.createAsset(imageFile);
      await asset.setAltText(imagePrompt.slice(0, 120));

      let inserted = false;
      if (insertOnCanvas) {
        const selectedElement = await webflow.getSelectedElement();
        if (selectedElement) {
          const imageElement = (await selectedElement.after("img")) as ImageElement;
          await imageElement.setAsset(asset);
          inserted = true;
        }
      }

      setStatus(
        inserted
          ? "Image added to Assets and inserted after the selected element."
          : "Image added to Webflow Assets.",
      );
      await webflow.notify({ type: "Success", message: "Magic Hour image added." });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setStatus("Canceled");
      } else {
        const message = caught instanceof Error ? caught.message : "Generation failed.";
        setError(message);
        setStatus("Failed");
        await webflow.notify({ type: "Error", message });
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  };

  return (
    <main>
      <header>
        <div className="mark">M</div>
        <div>
          <h1>Magic Hour</h1>
          <p>Generate an image and add it to this Webflow site.</p>
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <label>
          API key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Magic Hour API key"
            autoComplete="off"
            disabled={running}
          />
          <small>Used only for this session. It is never saved.</small>
        </label>

        <label>
          Prompt
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="A cinematic product photo on a sculptural pedestal…"
            rows={5}
            maxLength={2000}
            disabled={running}
          />
        </label>

        <div className="row">
          <label>
            Aspect ratio
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} disabled={running}>
              <option value="1:1">Square · 1:1</option>
              <option value="16:9">Landscape · 16:9</option>
              <option value="9:16">Portrait · 9:16</option>
            </select>
          </label>
          <label>
            Resolution
            <select value={resolution} onChange={(event) => setResolution(event.target.value)} disabled={running}>
              <option value="640px">640px</option>
              <option value="1k">1K</option>
              <option value="2k">2K</option>
              <option value="4k">4K</option>
            </select>
          </label>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={insertOnCanvas}
            onChange={(event) => setInsertOnCanvas(event.target.checked)}
            disabled={running}
          />
          Insert after the selected element
        </label>

        {error && <div className="error">{error}</div>}
        <div className="status" aria-live="polite">{status}</div>

        <div className="actions">
          <button className="primary" type="submit" disabled={running}>
            {running ? "Generating…" : "Generate image"}
          </button>
          {running && (
            <button className="secondary" type="button" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <footer>Generation uses Magic Hour credits. Model availability depends on your plan.</footer>
    </main>
  );
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error('Could not find element with id "root"');
ReactDOM.createRoot(rootElement).render(<App />);
