import api, { count as current, increment as inc } from './import-live-bindings/dependency.js';
import './import-live-bindings/side-effect.js';
console.log(api.label, current);
inc();
console.log(current);
