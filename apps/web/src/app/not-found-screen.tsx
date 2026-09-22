import type { JSX } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "./routes.js";
import { useTranslate } from "../app/language-context.js";

export const NotFoundScreen = (): JSX.Element => {
  const t = useTranslate();

  return (
    <main className="screen">
      <h2>{t("shell.notFoundTitle")}</h2>
      <p>{t("shell.notFoundBody")}</p>
      <Link to={ROUTES.inventory}>{t("shell.backToInventory")}</Link>
    </main>
);
};
