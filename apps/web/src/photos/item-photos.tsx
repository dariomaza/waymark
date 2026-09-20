import { MAX_ITEM_PHOTOS, PhotoProcessingStatus } from "@ariadna/domain";
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
import { photoThumbnailUrl } from "./photo-urls.js";
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
 * later, or may not exist at all (ADR 4). The only thing the UI says about it
 * is a quiet line under a photo that was just uploaded, because that is the
 * one moment somebody might otherwise wonder whether it worked.
 *
 * The per-photo status is not available here at all: `ItemView.photos` is a
 * list of ids, and the API exposes a `PhotoView` only in the answer to an
 * upload. That is why the note is tied to the upload that just happened
 * rather than shown against every pending photo.
 */
export const ItemPhotos = ({ item }: ItemPhotosProps): JSX.Element => {
  const upload = useUploadItemPhoto(item.id);
  const reorder = useReorderItemPhotos(item.id);
  const remove = useDeleteItemPhoto(item.id);

  const full = tooManyPhotosMessage(
    upload.error,
    detailNumber(upload.error, "limit") ?? MAX_ITEM_PHOTOS,
  );
  const justUploadedIsPending =
    upload.data?.photo.processingStatus === PhotoProcessingStatus.PENDING;

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

      {justUploadedIsPending ? (
        <p className="item-photos__pending">
          Background removal is still pending. The original is shown, and it stays
          shown whether or not the background is ever removed.
        </p>
      ) : null}

      {item.photos.length === 0 ? null : (
        <ul className="item-photos__grid" aria-label="Photos">
          {item.photos.map((id, index) => (
            <li className="item-photos__cell" key={id}>
              <AuthenticatedImage
                src={photoThumbnailUrl(id)}
                alt={
                  index === 0
                    ? `Cover photo of ${item.name}`
                    : `Photo ${String(index + 1)} of ${item.name}`
                }
              />
              <div className="item-photos__controls">
                {index === 0 ? (
                  <span className="item-photos__cover">Cover</span>
                ) : (
                  <>
                    <Button
                      tone="quiet"
                      onClick={() => {
                        reorder.mutate(withCoverFirst(item.photos, id));
                      }}
                    >
                      Make photo {index + 1} the cover
                    </Button>
                    <Button
                      tone="quiet"
                      onClick={() => {
                        reorder.mutate(movedEarlier(item.photos, id));
                      }}
                    >
                      Move photo {index + 1} earlier
                    </Button>
                  </>
                )}
                <Button
                  tone="quiet"
                  onClick={() => {
                    remove.mutate(id);
                  }}
                >
                  Delete photo {index + 1}
                </Button>
              </div>
            </li>
          ))}
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
