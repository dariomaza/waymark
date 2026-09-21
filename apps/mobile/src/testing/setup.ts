import { apiServer } from "./api-server.js";
import { discardQueryCaches } from "./render-app.js";

beforeAll(() => {
  apiServer.listen();
});

afterEach(() => {
  apiServer.resetHandlers();
  discardQueryCaches();
});

afterAll(() => {
  apiServer.close();
});
