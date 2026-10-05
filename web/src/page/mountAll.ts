import { LifecycleController, mountIslands, type EventBus, type IslandSpec, type LCMComponent, type PageSpec, type Registry } from "@panyam/tsappkit";

/**
 * Mounts every island in `spec` (mountIslands), waits until each one has
 * either mounted or been skipped, then runs them all through one
 * LifecycleController, in spec order, and resolves with them.
 *
 * For a page without IslandPage, such as an embed on someone else's site. A
 * lazy registry entry mounts only once its chunk arrives, so mountIslands'
 * own return value never includes it; waiting here is what lets a caller
 * that awaits this treat the islands as up and running, as before they were
 * lazy. Load strategies are ignored: every island mounts as soon as it can.
 * An island that can't mount (unknown, no slot, its factory threw, its chunk
 * failed to load) is passed to `log` and left out rather than waited for.
 */
export async function mountAll<Ctx, El>(
  spec: PageSpec,
  registry: Registry<Ctx, El, LCMComponent, EventBus>,
  findSlot: (slot: string) => El | null,
  context: () => Ctx,
  bus: EventBus,
  log: (message: string) => void,
): Promise<LCMComponent[]> {
  const mounted = new Map<IslandSpec, LCMComponent>();
  let left = spec.islands.length;
  let done = () => {};
  const settled = new Promise<void>((resolve) => (done = resolve));
  const settle = () => {
    if (--left === 0) done();
  };
  if (left === 0) done();
  mountIslands(spec, registry, findSlot, context, bus, log, {
    onMount: (component, island) => {
      mounted.set(island, component);
      settle();
    },
    onSkip: () => settle(),
  });
  await settled;
  const components = spec.islands.flatMap((island) => mounted.get(island) ?? []);
  // No page class runs the islands' lifecycle here, so a stand-in root does.
  const top: LCMComponent = { performLocalInit: () => components, setupDependencies() {}, activate() {}, deactivate() {} };
  await new LifecycleController(bus, LifecycleController.DefaultConfig).initializeFromRoot(top);
  return components;
}
