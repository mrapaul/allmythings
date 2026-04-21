// Activities registered with the Temporal worker via `import * as activities`.
// Each named export becomes an activity the workflow can invoke.
export { savePhoto } from './save-photo.activity';
export { florenceDetect } from './florence-detect.activity';
export { enrichItem } from './enrich-item.activity';
export { assembleResult } from './assemble-result.activity';
