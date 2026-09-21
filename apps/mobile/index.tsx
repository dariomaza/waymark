import { registerRootComponent } from "expo";

import { App } from "./src/app/app.js";

/**
 * The entry point, and nothing else. Everything the app IS lives under
 * `src/`, in a folder named after what it does.
 */
registerRootComponent(() => <App />);
