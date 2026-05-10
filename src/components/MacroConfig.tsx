import type { AppConfig } from "../types";

type MacroConfigProps = {
  skill: AppConfig["skill"];
  onChange: (skill: AppConfig["skill"]) => void;
};

export function MacroConfig({ skill, onChange }: MacroConfigProps) {
  return (
    <section className="panel">
      <h2>Macro</h2>
      <div className="config-group">
        <label>
          Skill
          <select value={skill} onChange={(event) => onChange(event.target.value as AppConfig["skill"])}>
            <option value="normal">Normal</option>
            <option value="boomjump">Boomjump</option>
          </select>
        </label>
      </div>
    </section>
  );
}
