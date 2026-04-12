// Manual type matching tRPC response shape. Dates are strings (JSON serialization over HTTP).
// For new domains, prefer tRPC inference: type Post = RouterOutput['post']['list'][number]
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}
