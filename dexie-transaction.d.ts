import "dexie";

declare module "dexie" {
  interface Dexie {
    transaction<T>(
      mode: "r" | "rw" | "r!" | "rw!" | "r?" | "rw?",
      table1: unknown,
      table2: unknown,
      table3: unknown,
      table4: unknown,
      table5: unknown,
      table6: unknown,
      scope: () => T | PromiseLike<T>,
    ): Promise<T>;
  }
}
