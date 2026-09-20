/**
 * Base class for every error the domain raises on purpose. Adapters can tell a
 * rule violation from a crash with a single `instanceof` check.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
