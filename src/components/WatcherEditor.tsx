import { NumberField } from "./fields";
import type { AppConfig, PixelConfig } from "../types";

type WatcherEditorProps = {
  config: AppConfig;
  patchConfig: (mutator: (draft: AppConfig) => void) => Promise<void>;
  onReset: () => Promise<void>;
};

export function WatcherEditor({ config, patchConfig, onReset }: WatcherEditorProps) {
  return (
    <section className="panel watcher-panel">
      <div className="panel-title-row">
        <h2>Pixel Watcher</h2>
        <button className="small-btn" onClick={onReset}>Reset</button>
      </div>
      {config.watcher.resolutions.map((resolution, resolutionIndex) => (
        <div className="resolution-editor" key={`${resolution.width}-${resolution.height}-${resolutionIndex}`}>
          <div className="resolution-title">
            <h3>{resolution.width} x {resolution.height}</h3>
            <div className="resolution-inputs">
              <NumberField label="Width" value={resolution.width} onChange={(value) => patchConfig((draft) => {
                const target = draft.watcher.resolutions[resolutionIndex];
                if (target) target.width = value;
              })} />
              <NumberField label="Height" value={resolution.height} onChange={(value) => patchConfig((draft) => {
                const target = draft.watcher.resolutions[resolutionIndex];
                if (target) target.height = value;
              })} />
            </div>
          </div>
          {resolution.configs.map((pixel, pixelIndex) => (
            <PixelEditor
              key={`${pixel.key}-${pixelIndex}`}
              pixel={pixel}
              onChange={(next) => patchConfig((draft) => {
                const target = draft.watcher.resolutions[resolutionIndex]?.configs;
                if (target) target[pixelIndex] = next;
              })}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function PixelEditor({ pixel, onChange }: {
  pixel: PixelConfig;
  onChange: (pixel: PixelConfig) => void;
}) {
  function update(mutator: (draft: PixelConfig) => void) {
    const next = structuredClone(pixel);
    mutator(next);
    onChange(next);
  }

  const hexColor = "#" + pixel.target.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("");

  return (
    <div className="pixel-editor">
      <div className="state-label-container">
        <span className="label-text">State</span>
        <div className="state-badge">{pixel.key}</div>
      </div>
      <NumberField label="X" value={pixel.point[0]} onChange={(value) => update((draft) => { draft.point[0] = value; })} />
      <NumberField label="Y" value={pixel.point[1]} onChange={(value) => update((draft) => { draft.point[1] = value; })} />
      <label className="pixel-color-label">
        Color
        <input
          type="color"
          value={hexColor}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value.slice(1), 16);
            update((draft) => {
              draft.target = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
            });
          }}
        />
      </label>
      <NumberField label="Tolerance" value={pixel.tolerance} onChange={(value) => update((draft) => { draft.tolerance = value; })} />
    </div>
  );
}
