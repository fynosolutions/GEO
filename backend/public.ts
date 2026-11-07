// Shared entry points for the local test UI and the file-oriented CLI.
export { collectRestaurant, matchesIdentity, mapApify, readVerifiedMenuProviders, selectedPlatforms, platformGroups, fieldGroups, fieldsForPlatform, emptyListing, type CollectionInput, type Listing } from './collection.js';
export { outputFields, platforms, getJob, isBusy, startJob, startBatchJob, cancelJob } from './audit.js';

// Shared bounded provider execution for menu candidate discovery.
export {collectApify} from './apify.js';

export {collectBatch,parseStoreList,type BatchInput,type BatchProgress,type BatchStore} from './batch.js';
