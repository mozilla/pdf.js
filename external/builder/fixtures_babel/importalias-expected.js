import { Test } from "import-name";
import { Test2 } from './non-alias';
export { Test3 } from "import-name";
await import(/*webpackIgnore: true*/"./non-alias");
