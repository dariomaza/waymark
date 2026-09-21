/**
 * Builders for the JSON the API sends, for whichever client is being tested.
 *
 * They live beside the contract rather than in one app because a fixture is a
 * claim about what the API answers, and two copies of that claim are two
 * chances to be testing a shape the API no longer sends.
 *
 * The HTTP stub itself is NOT here. MSW is imported as `msw/node` in a browser
 * test and as `msw/native` in a React Native one, so each app declares its own
 * server; what they share is what goes in the responses.
 */
export {
  anItem,
  anItemHit,
  aPhoto,
  aSession,
  aStorageUnit,
  aTree,
  aUnitHit,
  withPhoto,
  type ItemOverrides,
  type PhotoOverrides,
  type SessionOverrides,
  type StorageUnitOverrides,
} from "./testing/fixtures.js";
