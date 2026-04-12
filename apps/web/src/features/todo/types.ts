import type { AppRouter, inferRouterOutputs } from "@project/api";

type RouterOutput = inferRouterOutputs<AppRouter>;

export type Todo = RouterOutput["todo"]["list"][number];
