import { useEffect, useState } from "react";
import { t } from "../shared/i18n";
import { getLocal, setLocal } from "../shared/storage";
import { WelcomeCard } from "../ui/WelcomeCard";

export function Popup() {
  const [welcome, setWelcome] = useState(false);
  useEffect(() => { getLocal("pw.ui").then((u) => setWelcome(u.welcomePending)); }, []);
  const dismiss = async () => {
    const ui = await getLocal("pw.ui");
    await setLocal({ "pw.ui": { ...ui, welcomePending: false } });
    setWelcome(false);
  };
  return (
    <div className="w-[360px] p-3 space-y-3">
      <h1 className="font-semibold">{t("extName")}</h1>
      {welcome && <WelcomeCard onDismiss={dismiss} />}
    </div>
  );
}
