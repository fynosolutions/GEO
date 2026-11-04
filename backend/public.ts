// Shared entry points for the local test UI and the file-oriented CLI.
export { collectRestaurant, selectedPlatforms, mapApify, readVerifiedMenuProviders, type CollectionInput, type Listing } from './collection.js';
export { outputFields, platforms, getJob, isBusy, startJob, cancelJob } from './audit.js';

// Shared bounded provider execution for menu candidate discovery.
export {collectApify} from './apify.js';
