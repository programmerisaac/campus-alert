// App.tsx (ROOT level — NOT inside src/)
/**
 * Expo entry point.
 *
 * IMPORTANT: We must call registerRootComponent here (via src/App.tsx)
 * rather than just exporting a default component.
 *
 * registerRootComponent does two things:
 *   1. Calls AppRegistry.registerComponent('main', () => App)
 *   2. Ensures the correct environment setup runs (e.g. Hermes, new arch)
 *
 * Without this call, React Native cannot find the 'main' component
 * and shows "App entry not found".
 */
import { registerRootComponent } from "expo";
import App from "./src/App";

// registerRootComponent mounts the App component using AppRegistry.
// It also handles the root SafeAreaProvider on iOS 14+ automatically.
registerRootComponent(App);
