/**
 * The only source of time in the domain. Entities never call `Date.now()`, so
 * every use case is testable with an explicit instant.
 */
export interface Clock {
  now(): Date;
}
