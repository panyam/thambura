import { BasePage, type EventBus, type LCMComponent } from "@panyam/tsappkit";
import { mountIslands, type Registry } from "./mount";
import { readSpec, type PageSpec } from "./spec";

/** The id of the script element the server writes the spec into. */
export const SPEC_ELEMENT_ID = "page-spec";

/**
 * A tsappkit page whose islands come from the page spec. A subclass says
 * which islands it can mount (`registry`) and builds the services they share
 * (`makeContext`, called once with the spec, before the first island mounts,
 * so it can build the instruments the spec seeds); the spec says which
 * islands this page gets and where.
 */
export abstract class IslandPage<Ctx> extends BasePage {
  protected abstract registry(): Registry<Ctx, HTMLElement, LCMComponent, EventBus>;
  protected abstract makeContext(spec: PageSpec): Ctx;

  protected override initializeSpecificComponents(): LCMComponent[] {
    const spec = readSpec(document.getElementById(SPEC_ELEMENT_ID)?.textContent);
    if (!spec) {
      console.warn(`page spec: no readable #${SPEC_ELEMENT_ID} on this page, so nothing is mounted`);
      return [];
    }
    return mountIslands(
      spec,
      this.registry(),
      (slot) => document.querySelector<HTMLElement>(`[data-slot="${slot}"]`),
      this.makeContext(spec),
      this.eventBus,
      (message) => console.warn(message),
    );
  }
}
