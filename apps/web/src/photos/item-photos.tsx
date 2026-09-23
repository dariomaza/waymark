import { type ItemView, detailNumber, movedEarlier, withCoverFirst } from "@waymark/api-client";
import { describeFailure, tooManyPhotosMessage } from "@waymark/i18n";
import { MAX_ITEM_PHOTOS } from "@waymark/domain";
import type { JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import {
  useDeleteItemPhoto,
  useReorderItemPhotos,
  useReprocessPhoto,
  useUploadItemPhoto,
} from "./photo-mutations.js";

import { PhotoPicker } from "./views/photo-picker.js";
import { PhotoStatusNote } from "./views/photo-status-note.js";
import "./item-photos.css";
import { useTranslate } from "../app/language-context.js";

export interface ItemPhotosProps {
  readonly item: ItemView;
}

/**
 * # An item's photos
 *
 * Ordered, first one is the cover, and the order is the only thing that says
 * so (ADR 9) — which is why "make this the cover" is a reorder and not a
 * field being set.
 *
 * Nothing here waits on background removal. A photo is uploaded, stored and
 * served from its original immediately; a sidecar may replace those bytes
 * later, or may not exist at all (ADR 4). What the screen says about that is
 * a quiet line under the photo it concerns, and only for the two states that
 * are news — see `photo-status.ts`.
 *
 * Every URL comes from the API. `ItemView.photos` carries whole photos, so
 * nothing here builds `/photos/<id>` out of an id and hopes the route has not
 * moved.
 */
export const ItemPhotos = ({ item }: ItemPhotosProps): JSX.Element => {
  const t = useTranslate();

  const upload = useUploadItemPhoto(item.id);
  const reorder = useReorderItemPhotos(item.id);
  const remove = useDeleteItemPhoto(item.id);
  const reprocess = useReprocessPhoto();

  const full = t(tooManyPhotosMessage(
    upload.error,
    detailNumber(upload.error, "limit") ?? MAX_ITEM_PHOTOS,
  ));
  // The order is what the API is asked to store; the photos themselves are
  // what it hands back (ADR 9).
  const order = item.photos.map((photo) => photo.id);

  return (
    <section className="item-photos">
      <h3>{t("photos.title")}</h3>

      <PhotoPicker
        label={t("photos.add")}
        busy={upload.isPending}
        onPick={(file) => {
          upload.mutate(file);
        }}
      />

      {upload.isError ? (
        <Callout tone={full === null ? "wrong" : "blocked"}>
          {full ?? t(describeFailure(upload.error))}
        </Callout>
      ) : null}

      {item.photos.length === 0 ? null : (
        <ul className="item-photos__grid" aria-label={t("photos.title")}>
          {item.photos.map((photo, index) => (
              <li className="item-photos__cell" key={photo.id}>
                <AuthenticatedImage
                  src={photo.thumbnailUrl}
                  alt={
                    index === 0
                      ? t("photos.coverOf", { name: item.name })
                      : t("photos.numberedOf", { index: index + 1, name: item.name })
                  }
                />
                <PhotoStatusNote
                  photo={photo}
                  retrying={reprocess.isPending}
                  onRetry={() => {
                    reprocess.mutate(photo.id);
                  }}
                />
                <div className="item-photos__controls">
                  {index === 0 ? (
                    <span className="item-photos__cover">{t("photos.cover")}</span>
                  ) : (
                    <>
                      <Button
                        tone="quiet"
                        onClick={() => {
                          reorder.mutate(withCoverFirst(order, photo.id));
                        }}
                      >
                        {t("photos.makeCover", { index: index + 1 })}
                      </Button>
                      <Button
                        tone="quiet"
                        onClick={() => {
                          reorder.mutate(movedEarlier(order, photo.id));
                        }}
                      >
                        {t("photos.moveEarlier", { index: index + 1 })}
                      </Button>
                    </>
                  )}
                  {/*
                    The two ordering controls above keep their words on
                    purpose: nothing in the icon set means "make this the
                    cover" or "move this one earlier", and a shape somebody
                    has to learn by pressing it is worse than the sentence.
                  */}
                  <Button
                    tone="quiet"
                    icon="trash"
                    onClick={() => {
                      remove.mutate(photo.id);
                    }}
                  >
                    {t("photos.deleteNumbered", { index: index + 1 })}
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      )}

      {reorder.isError ? (
        <Callout tone="wrong">{t(describeFailure(reorder.error))}</Callout>
      ) : null}
      {remove.isError ? (
        <Callout tone="wrong">{t(describeFailure(remove.error))}</Callout>
      ) : null}
      {reprocess.isError ? (
        <Callout tone="wrong">{t(describeFailure(reprocess.error))}</Callout>
      ) : null}
    </section>
  );
};
