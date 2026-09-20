import { MAX_ITEM_PHOTOS } from "@ariadna/domain";
import type { JSX } from "react";

import { detailNumber } from "../api/api-error.js";
import type { ItemView } from "../api/contract.js";
import { describeFailure } from "../api/describe-failure.js";
import { tooManyPhotosMessage } from "../items/item-messages.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { AuthenticatedImage } from "./authenticated-image.js";
import {
  useDeleteItemPhoto,
  useReorderItemPhotos,
  useUploadItemPhoto,
} from "./photo-mutations.js";
import { photoStatusNote } from "./photo-status.js";
import { movedEarlier, withCoverFirst } from "./reorder.js";
import { PhotoPicker } from "./views/photo-picker.js";
import "./item-photos.css";

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
  const upload = useUploadItemPhoto(item.id);
  const reorder = useReorderItemPhotos(item.id);
  const remove = useDeleteItemPhoto(item.id);

  const full = tooManyPhotosMessage(
    upload.error,
    detailNumber(upload.error, "limit") ?? MAX_ITEM_PHOTOS,
  );
  // The order is what the API is asked to store; the photos themselves are
  // what it hands back (ADR 9).
  const order = item.photos.map((photo) => photo.id);

  return (
    <section className="item-photos">
      <h3>Photos</h3>

      <PhotoPicker
        label="Add a photo"
        busy={upload.isPending}
        onPick={(file) => {
          upload.mutate(file);
        }}
      />

      {upload.isError ? (
        <Callout tone={full === null ? "wrong" : "blocked"}>
          {full ?? describeFailure(upload.error)}
        </Callout>
      ) : null}

      {item.photos.length === 0 ? null : (
        <ul className="item-photos__grid" aria-label="Photos">
          {item.photos.map((photo, index) => {
            const note = photoStatusNote(photo.processingStatus);

            return (
              <li className="item-photos__cell" key={photo.id}>
                <AuthenticatedImage
                  src={photo.thumbnailUrl}
                  alt={
                    index === 0
                      ? `Cover photo of ${item.name}`
                      : `Photo ${String(index + 1)} of ${item.name}`
                  }
                />
                {note === null ? null : (
                  <p className="item-photos__pending">{note}</p>
                )}
                <div className="item-photos__controls">
                  {index === 0 ? (
                    <span className="item-photos__cover">Cover</span>
                  ) : (
                    <>
                      <Button
                        tone="quiet"
                        onClick={() => {
                          reorder.mutate(withCoverFirst(order, photo.id));
                        }}
                      >
                        Make photo {index + 1} the cover
                      </Button>
                      <Button
                        tone="quiet"
                        onClick={() => {
                          reorder.mutate(movedEarlier(order, photo.id));
                        }}
                      >
                        Move photo {index + 1} earlier
                      </Button>
                    </>
                  )}
                  <Button
                    tone="quiet"
                    onClick={() => {
                      remove.mutate(photo.id);
                    }}
                  >
                    Delete photo {index + 1}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reorder.isError ? (
        <Callout tone="wrong">{describeFailure(reorder.error)}</Callout>
      ) : null}
      {remove.isError ? (
        <Callout tone="wrong">{describeFailure(remove.error)}</Callout>
      ) : null}
    </section>
  );
};
