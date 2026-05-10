import { open } from "@tauri-apps/plugin-dialog";
import { HexColorPicker } from "react-colorful";
import { SliderField } from "./fields";
import { useCrosshairPreview } from "../hooks/useCrosshairPreview";
import type { AppConfig } from "../types";

type CrosshairConfigPanelProps = {
  config: AppConfig;
  patchConfig: (mutator: (draft: AppConfig) => void) => Promise<void>;
  onReset: () => Promise<void>;
};

export function CrosshairConfigPanel({ config, patchConfig, onReset }: CrosshairConfigPanelProps) {
  const previewImageSrc = useCrosshairPreview(config.crosshair.customImage);

  async function selectCustomImage() {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "ico", "bmp"] }],
      });
      if (typeof file === "string") {
        await patchConfig((draft) => {
          draft.crosshair.customImage = file;
        });
      }
    } catch (err) {
      console.error("Failed to open dialog", err);
    }
  }

  return (
    <section className="panel crosshair-panel">
      <div className="panel-title-row">
        <h2>Crosshair</h2>
        <button className="small-btn" onClick={onReset}>Reset</button>
      </div>
      <div className="crosshair-config-layout">
        <div className="config-group">
          <div className="crosshair-top-row">
            <label className="check-row">
              <input
                type="checkbox"
                checked={config.crosshair.enabled}
                onChange={(event) => patchConfig((draft) => { draft.crosshair.enabled = event.target.checked; })}
              />
              Enabled
            </label>
          </div>

          <div className="custom-image-row">
            <span className="label-text">Image</span>
            <div className="image-picker">
              <button className="small-btn" onClick={selectCustomImage}>Browse...</button>
              {config.crosshair.customImage ? (
                <>
                  <span className="file-name" title={config.crosshair.customImage}>
                    {config.crosshair.customImage.split(/[\\/]/).pop()}
                  </span>
                  <button
                    className="small-btn danger"
                    onClick={() => patchConfig((draft) => { draft.crosshair.customImage = null; })}
                  >
                    Clear
                  </button>
                </>
              ) : (
                <span className="file-name text-muted">Default</span>
              )}
            </div>
          </div>

          <div className="crosshair-sliders">
            <SliderField label="Offset X" value={config.crosshair.offset.x} min={-500} max={500} onChange={(value) => patchConfig((draft) => { draft.crosshair.offset.x = value; })} />
            <SliderField label="Offset Y" value={config.crosshair.offset.y} min={-500} max={500} onChange={(value) => patchConfig((draft) => { draft.crosshair.offset.y = value; })} />
            <SliderField label="Scale" value={config.crosshair.scale} step={0.1} min={0.1} max={10.0} onChange={(value) => patchConfig((draft) => { draft.crosshair.scale = value; })} />
            <SliderField label="Opacity" value={config.crosshair.opacity ?? 1.0} step={0.05} min={0.1} max={1.0} onChange={(value) => patchConfig((draft) => { draft.crosshair.opacity = value; })} />
          </div>
        </div>
        <div className="crosshair-visuals">
          <div className="preview-checkerboard">
            <div className="preview-scaler" style={{
              transform: `scale(${config.crosshair.scale})`,
              opacity: config.crosshair.opacity ?? 1.0,
            }}>
              <img src={previewImageSrc} className="preview-base-img" alt="" />
              <div className="preview-multiply-tint" style={{
                backgroundColor: config.crosshair.color,
                maskImage: `url("${previewImageSrc}")`,
                WebkitMaskImage: `url("${previewImageSrc}")`,
              }} />
            </div>
          </div>
          <HexColorPicker color={config.crosshair.color} onChange={(value) => patchConfig((draft) => { draft.crosshair.color = value; })} />
        </div>
      </div>
    </section>
  );
}
