/**
 * The pluck worker (esbuild -> static/pluckWorker.js, a classic script so a
 * blob worker can `importScripts` it when another site embeds us). It
 * renders thambura plucks off the main thread for `WorkerPoolRenderer`
 * (player/pluckRenderer.ts); the work itself is in player/pluckWorkerCore.ts.
 */
import { pluckWorker, type PluckReply, type PluckRequest } from "./player/pluckWorkerCore";

// `self` is typed as a window here (the DOM lib); this is what it really is.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PluckRequest>) => void) | null;
  postMessage(msg: PluckReply, transfer: Transferable[]): void;
};

// Between slices the worker yields through a message to itself rather than
// setTimeout, which browsers clamp to 4 ms once calls nest, so a render
// isn't slowed by the pauses that let a cancel in.
const channel = new MessageChannel();
const waiting: (() => void)[] = [];
channel.port1.onmessage = () => waiting.shift()?.();

const handle = pluckWorker(
  (reply, transfer) => scope.postMessage(reply, transfer),
  (cb) => {
    waiting.push(cb);
    channel.port2.postMessage(null);
  },
);
scope.onmessage = (e) => handle(e.data);
