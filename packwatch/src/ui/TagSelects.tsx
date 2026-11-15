import { TAGS } from "../shared/data";
import { t } from "../shared/i18n";

export function TagSelects({ game, productType, onChange }: { game?: string; productType?: string; onChange: (v: { game?: string; productType?: string }) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <select className="input" aria-label={t("game")} value={game ?? ""} onChange={(e) => onChange({ game: e.target.value || undefined, productType })}>
        <option value="">{t("gameAny")}</option>
        {TAGS.games.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select>
      <select className="input" aria-label={t("productType")} value={productType ?? ""} onChange={(e) => onChange({ game, productType: e.target.value || undefined })}>
        <option value="">{t("productTypeAny")}</option>
        {TAGS.productTypes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
  );
}
