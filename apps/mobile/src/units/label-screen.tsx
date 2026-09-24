import { queryKeys } from "@waymark/api-client";
import { unitId } from "@waymark/domain";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useApi } from "../api/api-context.js";
import type { RootStackParamList } from "../app/navigation.js";
import { useSessionStore } from "../auth/session-context.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import { useStorageUnit } from "./unit-queries.js";
import { useTranslate } from "../app/language-context.js";

/**
 * # The label that goes on the box
 *
 * The symbol is generated on demand and never stored: it is a pure function of
 * the unit's `publicId` and the configured public base URL, so a stored one
 * would only be a picture of a dead URL the day that setting moves.
 *
 * The PNG is used rather than the SVG. The SVG is the one to PRINT, and this
 * screen is not printing: it is holding the symbol up next to a box so somebody
 * can check the sticker matches, and for that a bitmap the native decoder can
 * draw is the right answer. The sheet is where printing happens, on this client
 * as on the browser, and it fetches the SVG for exactly that reason.
 *
 * The code is spelled out underneath, in the same ten characters printed on
 * the sticker, so it can be read aloud across a garage.
 */
export const LabelScreen = (): JSX.Element => {
  const t = useTranslate();

  const route = useRoute<RouteProp<RootStackParamList, "Label">>();
  const api = useApi();
  const token = useSessionStore().token();
  const id = unitId(route.params.id);
  const unit = useStorageUnit(id);

  // The QR route is behind the session like everything else, so the symbol is
  // fetched with the token rather than pointed at by a bare URL.
  const symbol = useQuery({
    queryKey: queryKeys.qr(id),
    queryFn: () => api.qrPngUrl(id),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <Screen>
      {unit.isPending ? <Loading label={t("label.loadingPhone")} /> : null}

      {unit.isError ? (
        <FailureNote
          error={unit.error}
          title={t("label.drawFailed")}
          onRetry={() => {
            void unit.refetch();
          }}
        />
      ) : null}

      {unit.isSuccess && symbol.data !== undefined ? (
        <View style={styles.label}>
          <ScreenTitle>{unit.data.unit.name}</ScreenTitle>
          <Image
            accessibilityRole="image"
            accessibilityLabel={t("units.qrCodeFor", { name: unit.data.unit.name })}
            source={{
              uri: symbol.data,
              ...(token === null ? {} : { headers: { Authorization: `Bearer ${token}` } }),
            }}
            style={styles.symbol}
          />
          <Text style={styles.code} accessibilityLabel={t("units.codeIs", { code: unit.data.unit.publicId })}>
            {unit.data.unit.publicId}
          </Text>
          {/*
            * This used to say "print this from the web client". That stopped
            * being true the day the phone got a label sheet (ADR 21, amended),
            * and it was answering a question nobody standing in front of a box
            * is asking. What is worth saying here is what the symbol DOES, and
            * it is the same sentence the browser's label screen says.
            */}
          <Text style={styles.hint}>{t("label.anyCamera")}</Text>
        </View>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  label: { alignItems: "center", gap: space.s3 },
  symbol: { width: 260, height: 260, backgroundColor: "#ffffff", borderRadius: space.s2 },
  code: { color: colors.ink, fontSize: text.l, fontWeight: "700", letterSpacing: 2 },
  hint: { color: colors.inkMuted, fontSize: text.s, textAlign: "center" },
});
