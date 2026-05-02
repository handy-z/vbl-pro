import { sleep } from "./utils";

export abstract class Chain<TSelf> implements PromiseLike<void> {
  protected promise: Promise<void>;

  constructor(initial: Promise<void>) {
    this.promise = initial;
  }

  wait(ms: number): TSelf {
    return this.append(() => sleep(ms));
  }

  protected append(action: () => void | Promise<void>): TSelf {
    this.promise = this.promise.then(action);
    return this as unknown as TSelf;
  }

  then<T = void, R = never>(
    onfulfilled?: ((value: void) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ): Promise<T | R> {
    return this.promise.then(onfulfilled, onrejected);
  }
}
